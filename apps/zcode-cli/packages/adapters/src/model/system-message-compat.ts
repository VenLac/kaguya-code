import {
  modelMessageContentToText,
  type ModelInputMessage,
} from "@zcode/contracts";

export function normalizeOpenAiCompatibleSystemMessages(
  messages: readonly ModelInputMessage[],
): ModelInputMessage[] {
  let leadingSystemCount = 0;
  while (messages[leadingSystemCount]?.role === "system") {
    leadingSystemCount += 1;
  }

  if (leadingSystemCount <= 1) {
    return [...messages];
  }

  const leadingSystemMessages = messages.slice(0, leadingSystemCount);
  const lastLeadingSystem = leadingSystemMessages.at(-1);

  // 部分旧式 OpenAI-compatible chat template 只接受一个开头 system。
  // Core 为 Anthropic cache boundary 有意保留多段，因此只在兼容协议序列化边界按原顺序合并。
  // Kaguya Code by design：每个后续 block 自带左边界，adapter 不推断或补写任何空白。
  return [
    {
      role: "system",
      content: leadingSystemMessages
        .map((message) => modelMessageContentToText(message.content))
        .join(""),
      ...(lastLeadingSystem?.cacheControl
        ? { cacheControl: { ...lastLeadingSystem.cacheControl } }
        : {}),
    },
    ...messages.slice(leadingSystemCount),
  ];
}
