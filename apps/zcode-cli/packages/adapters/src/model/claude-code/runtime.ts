import { ExternalToolRegistry } from "./external-tools.js";
import { ClaudeRunRegistry } from "./run.js";

/**
 * 本机 Claude 渠道的长生命周期状态：进行中的 claude 进程与它正在执行的工具调用。
 * 模型对象是「每次请求新建」的，而 run 要跨多个模型步骤存活，所以这份状态由模型执行层持有并注入。
 */
export class ClaudeCodeRuntime {
  readonly externalTools = new ExternalToolRegistry();
  readonly runs = new ClaudeRunRegistry();
}
