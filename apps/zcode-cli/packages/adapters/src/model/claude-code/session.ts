import { createHash } from "node:crypto";
import { findClaudeSessionFile, isClaudeSessionId } from "@zcode/shared/node";
import type { ClaudeSessionMode } from "./args.js";
import { CLAUDE_SESSION_NAMESPACE, SESSION_TYPE_MAIN } from "./constants.js";
import type { ClaudePromptMode } from "./prompt.js";

const SESSION_ID_INTERNAL_PREFIX = "sess_";
const UUID_V5_VERSION_NIBBLE = 0x50;
const UUID_VARIANT_MASK = 0x3f;
const UUID_VARIANT_BITS = 0x80;

function uuidV5(name: string, namespace: string): string {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(namespaceBytes).update(name).digest();
  hash[6] = (hash[6]! & 0x0f) | UUID_V5_VERSION_NIBBLE;
  hash[8] = (hash[8]! & UUID_VARIANT_MASK) | UUID_VARIANT_BITS;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Kaguya 会话 id → Claude 会话 id。
 *
 * 去掉 `sess_` 前缀后若本身就是 UUID 就直接沿用：这样导入 Claude 历史会话时，
 * 让 Kaguya 会话 id 等于 Claude 会话 id，续聊天然落到同一份 jsonl，不需要额外的映射文件。
 * 不是 UUID 时用 UUIDv5 稳定派生，保证同一个 Kaguya 会话永远对应同一个 Claude 会话。
 */
export function claudeSessionIdFor(kaguyaSessionId: string): string {
  const bare = kaguyaSessionId.startsWith(SESSION_ID_INTERNAL_PREFIX)
    ? kaguyaSessionId.slice(SESSION_ID_INTERNAL_PREFIX.length)
    : kaguyaSessionId;
  return isClaudeSessionId(bare)
    ? bare.toLowerCase()
    : uuidV5(kaguyaSessionId, CLAUDE_SESSION_NAMESPACE);
}

interface ClaudeSessionPlan {
  session: ClaudeSessionMode;
  promptMode: ClaudePromptMode;
}

export async function planClaudeSession(input: {
  kaguyaSessionId?: string;
  sessionType?: string;
  /** prompt 里除末尾用户输入之外是否已有对话历史。 */
  hasHistory: boolean;
  cwd: string;
  env: Record<string, string | undefined>;
}): Promise<ClaudeSessionPlan> {
  // 标题、摘要等辅助请求（以及子 agent）一次性执行，不创建 Claude 会话、不写 jsonl。
  if (input.sessionType !== SESSION_TYPE_MAIN || !input.kaguyaSessionId) {
    return { session: { kind: "ephemeral" }, promptMode: "ephemeral" };
  }
  const sessionId = claudeSessionIdFor(input.kaguyaSessionId);
  const existing = await findClaudeSessionFile(sessionId, { cwd: input.cwd, env: input.env });
  if (existing) {
    return { session: { kind: "resume", sessionId }, promptMode: "resume" };
  }
  return {
    session: { kind: "new", sessionId },
    promptMode: input.hasHistory ? "seed" : "resume",
  };
}
