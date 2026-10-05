import { CLAUDE_TOOL_INPUT_PREVIEW_CHARS, CLAUDE_TOOL_OUTPUT_PREVIEW_CHARS } from "./constants.js";

// Claude 在自己的进程里执行工具；Kaguya core 对「provider 已执行的工具」只跳过、不接收结果
// （流里的 tool-result 会被丢弃，历史里会留下没有结果的 tool call，换模型时违反协议）。
// 所以工具活动以纯文本呈现在回复里：历史保持纯文本，任意模型都能继续这段对话。

const TRUNCATION_MARK = "…";
const TOOL_MARKER = "▸";

/** 每个工具里最能说明「它在做什么」的入参字段，按顺序取第一个存在的。 */
const TOOL_SUMMARY_FIELDS = [
  "command",
  "file_path",
  "path",
  "pattern",
  "url",
  "query",
  "description",
  "prompt",
] as const;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}${TRUNCATION_MARK}` : text;
}

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function summarizeToolInput(input: unknown): string {
  if (typeof input === "object" && input !== null) {
    const record = input as Record<string, unknown>;
    for (const field of TOOL_SUMMARY_FIELDS) {
      const value = record[field];
      if (typeof value === "string" && value.trim()) {
        return truncate(singleLine(value), CLAUDE_TOOL_INPUT_PREVIEW_CHARS);
      }
    }
  }
  try {
    return truncate(singleLine(JSON.stringify(input) ?? ""), CLAUDE_TOOL_INPUT_PREVIEW_CHARS);
  } catch {
    return "";
  }
}

/** 反引号会提前结束行内代码，换成相近字符。 */
function inlineCode(text: string): string {
  return `\`${text.replace(/`/g, "'")}\``;
}

export function renderToolUse(name: string, input: unknown): string {
  const summary = summarizeToolInput(input);
  return `\n\n${TOOL_MARKER} **${name}**${summary ? ` ${inlineCode(summary)}` : ""}\n`;
}

/** tool_result 的 content 可能是字符串或 text 块数组。 */
export function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) =>
      typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text"
        ? String((block as { text?: unknown }).text ?? "")
        : "",
    )
    .filter(Boolean)
    .join("\n");
}

/** 围栏长度需大于内容里最长的连续反引号，否则输出里的 ``` 会提前结束代码块。 */
function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

export function renderToolResult(content: unknown, isError: boolean): string {
  const text = truncate(toolResultText(content).trim(), CLAUDE_TOOL_OUTPUT_PREVIEW_CHARS);
  if (!text) return isError ? "\n（工具执行失败，无输出）\n" : "";
  const fence = fenceFor(text);
  return `\n${isError ? "（失败）\n" : ""}${fence}\n${text}\n${fence}\n`;
}
