/**
 * Claude Code（本机）渠道卡片：直接使用本机已登录的 `claude`，Kaguya 不做登录、不接触任何凭证。
 * 这里只负责检测状态、启用/移除模型来源并展示；认证与运行都由本机 claude 自己完成。
 */
import { useCallback, useEffect, useState } from "react";
import type { ClaudeCodeStatus } from "@zcode/services";
import { Check, Power, RefreshCw, Terminal, Trash2 } from "@zcode/lunar-icons";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useServices } from "@/hooks/useServices.js";
import { logger } from "@/logger.js";

type Busy = "enable" | "disable" | "refresh" | "sync";

function statusBadgeId(status: ClaudeCodeStatus | null): string {
  if (!status || !status.installed) return "claudeCode.status.notInstalled";
  if (!status.loggedIn) return "claudeCode.status.loggedOut";
  return status.enabled ? "claudeCode.status.enabled" : "claudeCode.status.ready";
}

export function ClaudeCodeCard() {
  const { intl } = useZCodeIntl();
  const { claudeCodeService } = useServices();
  const [status, setStatus] = useState<ClaudeCodeStatus | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!claudeCodeService) return;
    try {
      setStatus(await claudeCodeService.getStatus());
    } catch (e) {
      logger.warn("[ClaudeCodeCard] 读取 Claude Code 状态失败", { error: String(e) });
    }
  }, [claudeCodeService]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!claudeCodeService) return null;

  const run = async (kind: Busy, action: () => Promise<unknown>) => {
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

  const ok = Boolean(status?.installed && status.loggedIn);
  const shownError = error ?? status?.error ?? null;
  const details = [
    status?.version
      ? intl.formatMessage({ id: "claudeCode.version" }, { version: status.version })
      : null,
    status?.authMethod
      ? intl.formatMessage({ id: "claudeCode.auth" }, { method: status.authMethod })
      : null,
    status?.subscriptionType
      ? intl.formatMessage({ id: "claudeCode.plan" }, { plan: status.subscriptionType })
      : null,
    status?.enabled && typeof status.modelCount === "number"
      ? intl.formatMessage({ id: "claudeCode.models" }, { count: status.modelCount })
      : null,
  ].filter(Boolean);

  return (
    <section
      data-testid="claude-code-card"
      className="rounded-xl border border-card-border bg-card p-4 shadow-xs"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-accent text-brand">
          <Terminal className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-ui-lg font-semibold text-foreground">
              {intl.formatMessage({ id: "claudeCode.title" })}
            </h3>
            <span
              className={
                ok
                  ? "inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-ui-caption font-medium text-success"
                  : "inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-ui-caption font-medium text-foreground-subtle"
              }
            >
              {ok ? <Check className="size-3" aria-hidden="true" /> : null}
              {intl.formatMessage({ id: statusBadgeId(status) })}
            </span>
          </div>
          <p className="text-ui-base leading-6 text-foreground-subtle">
            {intl.formatMessage({ id: "claudeCode.description" })}
          </p>
          {details.length > 0 ? (
            <p className="text-ui-base text-foreground-subtle">{details.join(" · ")}</p>
          ) : null}
          {status && !status.installed ? (
            <p className="text-ui-base text-warning">
              {intl.formatMessage({ id: "claudeCode.installHint" })}
            </p>
          ) : null}
          {status?.installed && !status.loggedIn ? (
            <p className="text-ui-base text-warning">
              {intl.formatMessage({ id: "claudeCode.loginHint" })}
            </p>
          ) : null}
          {shownError ? (
            <p role="alert" className="text-ui-base text-destructive">
              {intl.formatMessage({ id: "claudeCode.error" }, { message: shownError })}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => void run("refresh", () => Promise.resolve())}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {intl.formatMessage({ id: "claudeCode.recheck" })}
          </Button>
          {status?.enabled ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null || !ok}
                onClick={() => void run("sync", () => claudeCodeService.syncModels())}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {intl.formatMessage({ id: "claudeCode.sync" })}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void run("disable", () => claudeCodeService.disable())}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {intl.formatMessage({ id: "claudeCode.disable" })}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={busy !== null || !ok}
              onClick={() => void run("enable", () => claudeCodeService.enable())}
            >
              <Power className="size-3.5" aria-hidden="true" />
              {intl.formatMessage({ id: "claudeCode.enable" })}
            </Button>
          )}
        </div>
      </div>
      <p className="mt-3 border-t border-card-border pt-3 text-ui-caption leading-5 text-foreground-subtlest">
        {intl.formatMessage({ id: "claudeCode.hint" })}
      </p>
    </section>
  );
}
