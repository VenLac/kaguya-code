import type { LogContext, Logger } from "@zcode/contracts";

interface AiSdkWarningLoggerOptions {
  model?: unknown;
  provider?: unknown;
  warnings?: unknown;
}

type AiSdkWarningLogger = (options: AiSdkWarningLoggerOptions) => void;

type AiSdkWarningGlobal = typeof globalThis & {
  AI_SDK_LOG_WARNINGS?: false | AiSdkWarningLogger;
};

export function installZCodeProtocolAiSdkWarningLogger(logger: Logger): void {
  // AI SDK 默认 warning logger 第一次会用 console.info 写 stdout；
  // app-server --stdio 的 stdout 是 Kaguya Code Protocol NDJSON 帧通道，任何普通文本都会让宿主解析失败。
  (globalThis as AiSdkWarningGlobal).AI_SDK_LOG_WARNINGS = (
    options: AiSdkWarningLoggerOptions,
  ) => {
    try {
      const warnings = Array.isArray(options.warnings) ? options.warnings : [];
      logger.warn("AI SDK model warning", {
        event: "model.sdk.warning",
        module: "bootstrap.zcode_protocol",
        status: "completed",
        model: stringValue(options.model),
        provider: stringValue(options.provider),
        warningCount: warnings.length,
        warnings: warnings.map(summarizeWarning),
      });
    } catch {
      // warning 记录不能影响真实模型请求；stdout 纯净性由不调用 console.* 保证。
    }
  };
}

function summarizeWarning(warning: unknown): LogContext {
  if (!warning || typeof warning !== "object") {
    return { value: stringValue(warning) };
  }
  const record = warning as Record<string, unknown>;
  return {
    type: stringValue(record.type),
    feature: stringValue(record.feature),
    message: stringValue(record.message),
    details: stringValue(record.details),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
