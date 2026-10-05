import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

/** Codex（ChatGPT 账号）登录状态。 */
export interface CodexAuthStatus {
  readonly loggedIn: boolean;
  readonly email?: string;
  /** ChatGPT 套餐：plus / pro / team 等。 */
  readonly planType?: string;
  /** 浏览器授权进行中（本机回调服务已启动）。 */
  readonly loginInProgress: boolean;
  /** 最近一次登录失败的原因，成功或开始新登录后清空。 */
  readonly error?: string;
  /** 已注册到“模型来源”里的 Codex 来源 ID。 */
  readonly providerId?: string;
  /** 来源里当前的模型数量。 */
  readonly modelCount?: number;
  /** 最近一次同步的模型来源：live = 从 ChatGPT 拉到的；fallback = 拉取失败，用了内置列表。 */
  readonly modelsSource?: "live" | "fallback";
}

/**
 * Codex 渠道：用 ChatGPT 账号（Codex OAuth）使用 GPT 模型，走用户自己的订阅额度。
 * 在 host process 中运行：负责 PKCE 登录、令牌落盘与刷新、把 Codex 注册为个人模型来源。
 */
export interface ICodexAuthService {
  getStatus(): Promise<CodexAuthStatus>;
  /** 启动本机回调服务并返回授权链接；调用方负责在系统浏览器里打开它，然后轮询 getStatus()。 */
  startLogin(): Promise<{ authorizeUrl: string }>;
  cancelLogin(): Promise<CodexAuthStatus>;
  /** 清除令牌并移除 Codex 模型来源。 */
  logout(): Promise<CodexAuthStatus>;
  /** 向 ChatGPT 后端拉取当前账号可用的模型列表并同步到来源里。 */
  syncModels(): Promise<CodexAuthStatus>;
}

export const ICodexAuthService = createServiceDescriptor<ICodexAuthService>(ServiceChannels.CodexAuth);
