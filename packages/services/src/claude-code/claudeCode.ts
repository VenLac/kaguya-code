import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

/** 已注册到模型来源里的一个 Claude 模型（来自模型来源视图，不另存）。 */
export interface ClaudeCodeModelInfo {
  readonly id: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly enabled: boolean;
}

/** 本机 Claude Code 的可用状态。不包含任何凭证、邮箱或组织信息。 */
export interface ClaudeCodeStatus {
  /** 是否找到本机的 `claude` 命令。 */
  readonly installed: boolean;
  readonly executablePath?: string;
  readonly version?: string;
  /** claude 自己报告的登录状态；Kaguya 不参与登录。 */
  readonly loggedIn: boolean;
  /** 登录方式，如 claude.ai / API key。 */
  readonly authMethod?: string;
  /** 订阅类型，如 pro / max。 */
  readonly subscriptionType?: string;
  /** 「Claude Code（本机）」是否已注册为模型来源。 */
  readonly enabled: boolean;
  readonly providerId?: string;
  readonly modelCount?: number;
  /** 已注册的模型；未启用时为空。 */
  readonly models?: readonly ClaudeCodeModelInfo[];
  /** 最近一次操作失败的原因。 */
  readonly error?: string;
}

/**
 * Claude Code（本机）渠道：Kaguya 直接调用用户本机已登录的 `claude`，不做登录、不读取任何凭证。
 * 在 host process 中运行：负责检测本机 claude，并把它注册 / 移除为个人模型来源。
 */
export interface IClaudeCodeService {
  getStatus(): Promise<ClaudeCodeStatus>;
  /** 检测到 claude 后注册模型来源；未安装时抛出带说明的错误。 */
  enable(): Promise<ClaudeCodeStatus>;
  /**
   * 重新向本机 claude 探测可用模型（真实模型 id、上下文窗口、最大输出）并同步到模型来源：
   * 新模型会加入，已有模型（含旧版本留下的别名模型）会被更新为真实配置。
   */
  syncModels(): Promise<ClaudeCodeStatus>;
  /** 移除模型来源。不影响本机 claude 及其会话记录。 */
  disable(): Promise<ClaudeCodeStatus>;
}

export const IClaudeCodeService = createServiceDescriptor<IClaudeCodeService>(
  ServiceChannels.ClaudeCode,
);
