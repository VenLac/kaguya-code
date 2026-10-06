import type { ModelReasoningContentBlock } from "@zcode/contracts";

type ReasoningTransformOptions = {
  providerKind?: "openai" | "anthropic" | "openai-compatible" | "gateway" | "custom" | "claude-code";
};
type ReasoningProviderOptions =
  | { providerOptions: Record<string, unknown> }
  | Record<string, never>;

export function providerOptionsForReasoningBlock(
  block: ModelReasoningContentBlock,
  options: ReasoningTransformOptions,
): ReasoningProviderOptions {
  const providerOptions = objectProviderOptions(block.providerOptions);
  if (options.providerKind !== "anthropic") {
    return block.providerOptions ? { providerOptions: block.providerOptions } : {};
  }

  if (hasAnthropicReasoningMetadata(block.providerOptions)) {
    return { providerOptions: block.providerOptions };
  }

  // 把“没有 signature”直接等同于“不兼容”会让同模型历史里的
  // unsigned thinking 在 provider 序列化前被静默删除。跨模型、孤立和尾部清理由请求级
  // history normalization 决定；这里用 serializer 支持的空签名表示保留的 unsigned block。
  return {
    providerOptions: {
      ...providerOptions,
      anthropic: {
        ...anthropicProviderOptions(block.providerOptions),
        signature: "",
      },
    },
  };
}

function hasAnthropicReasoningMetadata(
  providerOptions: unknown,
): providerOptions is Record<string, unknown> {
  const anthropicOptions = anthropicProviderOptions(providerOptions);
  return (
    typeof anthropicOptions.signature === "string" ||
    typeof anthropicOptions.redactedData === "string"
  );
}

function objectProviderOptions(providerOptions: unknown): Record<string, unknown> {
  if (!providerOptions || typeof providerOptions !== "object" || Array.isArray(providerOptions)) {
    return {};
  }

  return providerOptions as Record<string, unknown>;
}

function anthropicProviderOptions(providerOptions: unknown): Record<string, unknown> {
  if (!providerOptions || typeof providerOptions !== "object" || Array.isArray(providerOptions)) {
    return {};
  }

  const anthropicOptions = (providerOptions as Record<string, unknown>).anthropic;
  if (
    !anthropicOptions ||
    typeof anthropicOptions !== "object" ||
    Array.isArray(anthropicOptions)
  ) {
    return {};
  }

  return anthropicOptions as Record<string, unknown>;
}
