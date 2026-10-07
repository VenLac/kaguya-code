/**
 * Claude Code（本机）渠道的识别常量。纯函数、无 Node 依赖：host（注册来源）、adapters（选择模型实现）
 * 与 renderer（设置页把它从「自定义供应商」里排除）共用同一份判定。
 */

/**
 * 渠道哨兵 baseUrl。`.invalid` 是 RFC 2606 保留 TLD，永远不会被解析：
 * 即使识别失败而误走了 HTTP 通路，请求也只会在 DNS 阶段失败，不会泄露到任何真实主机。
 */
export const CLAUDE_CODE_BASE_URL = "https://claude-code.invalid";
/** provider 配置要求 apiKey 非空；本渠道不使用任何密钥，占位值仅用于通过校验。 */
export const CLAUDE_CODE_PLACEHOLDER_API_KEY = "claude-code-local";

const CLAUDE_CODE_HOSTNAME = "claude-code.invalid";

export function isClaudeCodeBaseUrl(baseUrl: string | null | undefined): boolean {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return false;
  try {
    return new URL(trimmed).hostname.toLowerCase() === CLAUDE_CODE_HOSTNAME;
  } catch {
    return false;
  }
}
