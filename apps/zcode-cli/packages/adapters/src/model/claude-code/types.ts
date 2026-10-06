import type { Logger, PermissionBrokerPort } from "@zcode/contracts";
import type { ClaudeCodeRuntime } from "./runtime.js";

export interface ClaudeCodeExecutionConfig {
  /** 本会话的工作区目录；claude 在该目录下运行并以此归档会话 jsonl。 */
  workingDirectory?: string;
  permissionBroker?: PermissionBrokerPort;
  /** 显式指定 claude 可执行文件路径；缺省按 PATH 与常见目录查找。 */
  executablePath?: string;
}

export interface ClaudeCodeLanguageModelOptions {
  modelId: string;
  config: ClaudeCodeExecutionConfig;
  runtime: ClaudeCodeRuntime;
  env: Record<string, string | undefined>;
  reasoningLevel?: string;
  logger?: Logger;
}
