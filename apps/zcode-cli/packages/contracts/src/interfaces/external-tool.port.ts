// ============================================================
// External Tool Execution Port
// ============================================================
//
// 有的 provider（本机 Claude Code）在**自己的进程里**执行工具：模型步骤结束时，
// tool_use 已经发出，真正的执行与结果由外部进程负责。
// 这个端口让 core 的 tool executor 把这类调用当成原生工具调用来记录
// （消息片段、事件、历史、展示卡片都走原生链路），但不在本地跑 handler，
// 而是等外部进程回传结果。

export type ExternalToolOutcome =
  | {
      success: true;
      /** 原生工具输出形状（如 Write 的 structuredPatch、Bash 的 stdout），用于生成原生展示卡片。 */
      output: unknown;
      /** 模型可见的结果文本（外部进程实际给模型看的内容）。 */
      modelContent: string;
    }
  | {
      success: false;
      error: string;
    };

export interface ExternalToolClaim {
  /** executor 开始处理该调用（工具行已存在）时调用；外部进程的权限请求会等待它，保证确认卡片出现在工具行之后。 */
  markStarted(): void;
  /** 等待外部进程回传结果；signal 中止时拒绝并让外部进程停止。 */
  waitForOutcome(signal?: AbortSignal): Promise<ExternalToolOutcome>;
}

export interface ExternalToolExecutionPort {
  /** 该调用是否由外部进程执行；不是则返回 undefined，走原生执行路径。 */
  claim(toolCallId: string): ExternalToolClaim | undefined;
}
