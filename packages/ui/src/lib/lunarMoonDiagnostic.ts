import type { LunarMoonProps } from "@zcode/lunar-icons";
import { logger } from "@/logger.js";

/** 字符月亮的诊断回调：lunar-icons 不依赖 UI 包，日志由这里统一接到 UI logger。 */
export const logLunarMoonDiagnostic: NonNullable<LunarMoonProps["onDiagnostic"]> = (
  level,
  message,
  detail,
) => {
  logger[level](`[lunar-moon] ${message}`, detail);
};
