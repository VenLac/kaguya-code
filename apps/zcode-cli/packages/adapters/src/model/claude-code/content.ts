/** tool_result 的 content 可能是字符串、text 块数组，或其他结构（如 tool_reference）。 */
export function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (typeof block !== "object" || block === null) return "";
      const record = block as { type?: unknown; text?: unknown };
      return record.type === "text" ? String(record.text ?? "") : "";
    })
    .filter(Boolean)
    .join("\n");
}
