import { Console } from "node:console";

/**
 * 为独占 stdout 的 CLI（stdio protocol / TUI）安装 console 输出边界。
 *
 * app-server/agent-server 的 stdout 只能承载 Kaguya Code Protocol NDJSON 帧，但三方
 * SDK 可能通过 console.* 写普通文本。如果不在加载这些依赖之前分离输出，
 * 任意一行日志都会被 Host 当作 JSON 解析，或直接覆盖 TUI 当前光标处的画面。
 */
export function installStderrConsoleBoundary(stderr: NodeJS.WritableStream): () => void {
  const originalConsole = globalThis.console;
  globalThis.console = new Console({ stdout: stderr, stderr });

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    globalThis.console = originalConsole;
  };
}
