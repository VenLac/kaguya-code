/**
 * Codex（ChatGPT 账号）渠道卡片：登录后即可在模型列表里使用 GPT 模型。
 * 登录在系统浏览器里完成（PKCE），主机服务监听本机回调；这里只负责发起、轮询状态与展示。
 */
import { useCallback, useEffect, useState } from "react";
import type { CodexAuthStatus } from "@zcode/services";
import { Check, LogOut, RefreshCw, Sparkles } from "@zcode/lunar-icons";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useServices } from "@/hooks/useServices.js";
import { logger } from "@/logger.js";

export function CodexAuthCard() {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const { codexAuthService } = useServices();
  const [status, setStatus] = useState<CodexAuthStatus | null>(null);
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"login" | "sync" | "logout" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!codexAuthService) return;
    try {
      setStatus(await codexAuthService.getStatus());
    } catch (e) {
      logger.warn("[CodexAuthCard] 读取 Codex 状态失败", { error: String(e) });
    }
  }, [codexAuthService]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 授权进行中：每秒查一次，完成后自动切换到“已登录”。
  const waiting = Boolean(status?.loginInProgress);
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(timer);
  }, [waiting, refresh]);
  useEffect(() => {
    if (status?.loggedIn || (!waiting && !authorizeUrl)) setAuthorizeUrl(null);
  }, [status?.loggedIn, waiting, authorizeUrl]);

  if (!codexAuthService) return null;

  const run = async (kind: "login" | "sync" | "logout", action: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const login = () =>
    run("login", async () => {
      const { authorizeUrl: url } = await codexAuthService.startLogin();
      setAuthorizeUrl(url);
      platform.openExternal(url);
    });

  const shownError = error ?? status?.error ?? null;

  return (
    <section
      data-testid="codex-auth-card"
      className="rounded-xl border border-card-border bg-card p-4 shadow-xs"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-accent text-brand">
          <Sparkles className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-ui-lg font-semibold text-foreground">
              {intl.formatMessage({ id: "codex.title" })}
            </h3>
            <span
              className={
                status?.loggedIn
                  ? "inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-ui-caption font-medium text-success"
                  : "inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-ui-caption font-medium text-foreground-subtle"
              }
            >
              {status?.loggedIn ? <Check className="size-3" aria-hidden="true" /> : null}
              {intl.formatMessage({
                id: waiting
                  ? "codex.status.waiting"
                  : status?.loggedIn
                    ? "codex.status.loggedIn"
                    : "codex.status.loggedOut",
              })}
            </span>
          </div>
          <p className="text-ui-base leading-6 text-foreground-subtle">
            {intl.formatMessage({ id: "codex.description" })}
          </p>
          {status?.loggedIn ? (
            <p className="text-ui-base text-foreground-subtle">
              {[
                status.email ? intl.formatMessage({ id: "codex.account" }, { email: status.email }) : null,
                status.planType ? intl.formatMessage({ id: "codex.plan" }, { plan: status.planType }) : null,
                typeof status.modelCount === "number"
                  ? intl.formatMessage({ id: "codex.models" }, { count: status.modelCount })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {status?.loggedIn && status.modelsSource === "fallback" ? (
            <p className="text-ui-base text-warning">
              {intl.formatMessage({ id: "codex.modelsFallback" })}
            </p>
          ) : null}
          {waiting && authorizeUrl ? (
            <p className="text-ui-base text-foreground-subtle">
              {intl.formatMessage({ id: "codex.manualHint" })}{" "}
              <button
                type="button"
                className="text-brand underline underline-offset-2"
                onClick={() => {
                  void navigator.clipboard?.writeText(authorizeUrl).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  });
                }}
              >
                {intl.formatMessage({ id: copied ? "codex.linkCopied" : "codex.copyLink" })}
              </button>
            </p>
          ) : null}
          {shownError ? (
            <p role="alert" className="text-ui-base text-destructive">
              {intl.formatMessage({ id: "codex.error" }, { message: shownError })}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status?.loggedIn ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void run("sync", () => codexAuthService.syncModels())}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {intl.formatMessage({ id: busy === "sync" ? "codex.syncing" : "codex.syncModels" })}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() => void run("logout", () => codexAuthService.logout())}
              >
                <LogOut className="size-3.5" aria-hidden="true" />
                {intl.formatMessage({ id: "codex.logout" })}
              </Button>
            </>
          ) : waiting ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void run("login", () => codexAuthService.cancelLogin())}
            >
              {intl.formatMessage({ id: "codex.cancel" })}
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={busy !== null} onClick={() => void login()}>
              {intl.formatMessage({ id: "codex.login" })}
            </Button>
          )}
        </div>
      </div>
      <p className="mt-3 border-t border-card-border pt-3 text-ui-caption leading-5 text-foreground-subtlest">
        {intl.formatMessage({ id: "codex.hint" })}
      </p>
    </section>
  );
}
