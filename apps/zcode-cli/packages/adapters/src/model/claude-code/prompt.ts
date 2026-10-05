import type { LanguageModelV3Message, LanguageModelV3Prompt } from "@ai-sdk/provider";
import type { ClaudeUserContentBlock } from "./process.js";

/** 历史转写进新会话时的字符上限，超出只保留最近部分，避免一次性请求过大。 */
const HISTORY_MAX_CHARS = 60_000;
const HISTORY_TRUNCATED_MARK = "[更早的对话已省略]\n";
const IMAGE_MEDIA_PREFIX = "image/";
const SYSTEM_REMINDER_OPEN = "<system-reminder>";
const SYSTEM_REMINDER_CLOSE = "</system-reminder>";

/**
 * Kaguya core 会在用户消息里单独插入整块 `<system-reminder>`（它自己的技能列表、环境信息、
 * 项目指令等，描述的是 Kaguya 的工具与路径）。claude 有自己的工具与项目上下文加载，
 * 把这些转发过去不仅没用，还会被 claude 当成「藏在用户消息里的指令」而拒绝配合（实测 haiku 会直接拒答）。
 * 只过滤「整块被 system-reminder 包裹」的文本块，用户自己写的正文不受影响。
 */
function isSystemReminderBlock(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith(SYSTEM_REMINDER_OPEN) && trimmed.endsWith(SYSTEM_REMINDER_CLOSE);
}

/**
 * - resume：claude 会话已持有历史，只发送最后一条 assistant 之后的用户输入。
 * - seed：新建 claude 会话但 Kaguya 已有历史（如中途切换到 Claude），把历史转写在前。
 * - ephemeral：一次性辅助请求（标题、摘要等），不落盘；system 提示另走 --system-prompt-file。
 */
export type ClaudePromptMode = "resume" | "seed" | "ephemeral";

function partText(part: { type: string; text?: string }): string | undefined {
  return part.type === "text" ? part.text : undefined;
}

function userBlocks(
  message: Extract<LanguageModelV3Message, { role: "user" }>,
): ClaudeUserContentBlock[] {
  const blocks: ClaudeUserContentBlock[] = [];
  for (const part of message.content) {
    if (part.type === "text") {
      if (part.text && !isSystemReminderBlock(part.text)) {
        blocks.push({ type: "text", text: part.text });
      }
    } else if (part.type === "file") {
      const image = toImageBlock(part.mediaType, part.data);
      blocks.push(
        image ?? {
          type: "text",
          text: `[附件 ${part.filename ?? part.mediaType} 未能传递给 Claude]`,
        },
      );
    }
  }
  return blocks;
}

function toImageBlock(mediaType: string, data: unknown): ClaudeUserContentBlock | undefined {
  if (!mediaType.startsWith(IMAGE_MEDIA_PREFIX)) return undefined;
  if (typeof data === "string") {
    return { type: "image", source: { type: "base64", media_type: mediaType, data } };
  }
  if (data instanceof Uint8Array) {
    return {
      type: "image",
      source: { type: "base64", media_type: mediaType, data: Buffer.from(data).toString("base64") },
    };
  }
  return undefined; // URL 形式 claude CLI 无法直接消费。
}

function messageToTranscript(message: LanguageModelV3Message): string {
  switch (message.role) {
    case "system":
      return `[system]: ${message.content}`;
    case "user": {
      const text = message.content
        .map((part) => {
          const text = partText(part);
          if (text !== undefined) return isSystemReminderBlock(text) ? "" : text;
          return part.type === "file" ? `[附件 ${part.filename ?? part.mediaType}]` : "";
        })
        .filter(Boolean)
        .join("\n");
      return text ? `[user]: ${text}` : "";
    }
    case "assistant": {
      const text = message.content
        .map(
          (part) =>
            partText(part) ?? (part.type === "tool-call" ? `[调用工具 ${part.toolName}]` : ""),
        )
        .filter(Boolean)
        .join("\n");
      return text ? `[assistant]: ${text}` : "";
    }
    case "tool":
      return "";
  }
}

/** 一次性请求里 prompt 自带的 system 提示（多条按顺序拼接）。 */
export function extractSystemPrompt(prompt: LanguageModelV3Prompt): string | undefined {
  const text = prompt
    .flatMap((message) => (message.role === "system" ? [message.content.trim()] : []))
    .filter(Boolean)
    .join("\n\n");
  return text || undefined;
}

function lastUserRun(prompt: LanguageModelV3Prompt): LanguageModelV3Message[] {
  let start = prompt.length;
  while (start > 0 && prompt[start - 1]?.role === "user") start -= 1;
  return prompt.slice(start) as LanguageModelV3Message[];
}

function transcriptOf(messages: LanguageModelV3Message[]): string {
  const text = messages.map(messageToTranscript).filter(Boolean).join("\n\n");
  return text.length > HISTORY_MAX_CHARS
    ? `${HISTORY_TRUNCATED_MARK}${text.slice(-HISTORY_MAX_CHARS)}`
    : text;
}

/** 把 AI SDK prompt 映射为发给 claude 的 user 消息内容块。 */
export function buildClaudeContent(
  prompt: LanguageModelV3Prompt,
  mode: ClaudePromptMode,
): ClaudeUserContentBlock[] {
  const trailingUsers = lastUserRun(prompt);
  const latest = trailingUsers.flatMap((message) =>
    message.role === "user" ? userBlocks(message) : [],
  );

  if (mode === "resume") return latest;

  const earlier = prompt.slice(0, prompt.length - trailingUsers.length) as LanguageModelV3Message[];
  // system 提示不进入用户消息：塞进去会被 claude 当成「藏在用户消息里的指令」而拒绝照做；
  // 一次性请求的 system 由 extractSystemPrompt 另行经 --system-prompt-file 传入。
  const history = transcriptOf(earlier.filter((m) => m.role !== "system"));
  if (!history) return latest;
  const lead =
    mode === "ephemeral"
      ? `<context>\n${history}\n</context>\n\n`
      : `<conversation_history>\n以下是此前的对话记录，请把它当作已发生的上下文继续。\n${history}\n</conversation_history>\n\n`;
  return [{ type: "text", text: lead }, ...latest];
}
