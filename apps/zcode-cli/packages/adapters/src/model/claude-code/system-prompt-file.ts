import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEMP_DIR_PREFIX = "kaguya-claude-";
const SYSTEM_PROMPT_FILE_NAME = "system-prompt.txt";
const PRIVATE_FILE_MODE = 0o600;

export interface SystemPromptFile {
  path: string;
  /** 删除临时目录；幂等，失败不抛（清理失败不能覆盖真实结果）。 */
  cleanup(): Promise<void>;
}

/**
 * 把一次性请求的 system 提示写进临时文件，交给 `--system-prompt-file`：
 * 提示可能很长，不走命令行参数（Windows 命令行长度有限），也避免 shell 转义问题。
 * system 提示可能含项目内容，文件权限收紧到 0600，请求结束立即删除。
 */
export async function createSystemPromptFile(text: string): Promise<SystemPromptFile> {
  const directory = await mkdtemp(join(tmpdir(), TEMP_DIR_PREFIX));
  const path = join(directory, SYSTEM_PROMPT_FILE_NAME);
  try {
    await writeFile(path, text, { mode: PRIVATE_FILE_MODE });
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  return {
    path,
    cleanup: () => rm(directory, { recursive: true, force: true }).catch(() => undefined),
  };
}
