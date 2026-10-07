import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

/** 与 Agent 运行时读取全局 AGENTS.md 的上限一致，超出部分会被运行时截断。 */
export const USER_INSTRUCTIONS_MAX_BYTES = 100 * 1024;

export interface UserInstructionsSnapshot {
  /** 由服务端解析的 `~/.zcode/AGENTS.md` 绝对路径，UI 只展示不拼接。 */
  path: string;
  exists: boolean;
  content: string;
  /** 文件原始字节的 SHA-256 十六进制；文件不存在时为 null。作为乐观并发的版本号。 */
  revision: string | null;
}

export type UserInstructionsWriteResult =
  | { status: "saved"; snapshot: UserInstructionsSnapshot }
  /** 读取之后磁盘内容已变化，未写入；snapshot 是磁盘上的最新内容。 */
  | { status: "conflict"; snapshot: UserInstructionsSnapshot }
  | { status: "tooLarge"; bytes: number; maxBytes: number };

export interface IUserInstructionsService {
  /** 读取全局 AGENTS.md；文件不存在时返回 exists:false 且不创建文件。 */
  read(): Promise<UserInstructionsSnapshot>;

  /**
   * 保存全局 AGENTS.md。`expectedRevision` 是读取时拿到的 revision（文件不存在时为 null）。
   * 目标是目录或不可写等 IO 错误以 rejection 抛出，由 UI 展示。
   */
  write(params: {
    content: string;
    expectedRevision: string | null;
  }): Promise<UserInstructionsWriteResult>;
}

export const IUserInstructionsService = createServiceDescriptor<IUserInstructionsService>(
  ServiceChannels.UserInstructions,
);
