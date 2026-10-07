/**
 * Claude Code（本机）渠道详情：直接使用本机已登录的 `claude`，Kaguya 不做登录、不接触任何凭证。
 * 这里只负责检测状态、启用/同步/移除模型来源并展示；认证与运行都由本机 claude 自己完成。
 * 直接铺在模型设置的详情区里（它本身已是卡片容器），不再套第二层卡片。
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ClaudeCodeModelInfo, ClaudeCodeStatus } from "@zcode/services";
import { Check, Copy, Power, RefreshCw, Terminal, Trash2 } from "@zcode/lunar-icons";
import { Button } from "@/components/ui/button.js";
import { Spinner } from "@/components/ui/spinner.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useServices } from "@/hooks/useServices.js";
import { logger } from "@/logger.js";

type Busy = "enable" | "disable" | "refresh" | "sync";

const INSTALL_COMMAND = "npm install -g @anthropic-ai/claude-code";
const LOGIN_COMMAND = "claude";
const COPIED_RESET_MS = 1500;

type Tone = "success" | "warning" | "neutral";

function statusOf(status: ClaudeCodeStatus | null): { labelId: string; tone: Tone } {
  if (!status) return { labelId: "claudeCode.status.checking", tone: "neutral" };
  if (!status.installed) return { labelId: "claudeCode.status.notInstalled", tone: "warning" };
  if (!status.loggedIn) return { labelId: "claudeCode.status.loggedOut", tone: "warning" };
  return status.enabled
    ? { labelId: "claudeCode.status.enabled", tone: "success" }
    : { labelId: "claudeCode.status.ready", tone: "neutral" };
}

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  neutral: "bg-surface text-foreground-subtle",
};

/** 1_000_000 → 1M，200_000 → 200K。 */
function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function CommandLine({ command }: { command: string }) {
  const { intl } = useZCodeIntl();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch (e) {
      logger.warn("[ClaudeCodeCard] 复制命令失败", { error: String(e) });
    }
  };
  return (
    <div className="flex min-h-8 items-center gap-2 rounded-lg border border-input-border bg-input py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 break-all font-mono text-ui-base text-foreground">
        {command}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={intl.formatMessage({ id: copied ? "claudeCode.copied" : "claudeCode.copy" })}
        onClick={() => void copy()}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-foreground-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </>
  );
}

function ModelList({ models }: { models: readonly ClaudeCodeModelInfo[] }) {
  const { intl } = useZCodeIntl();
  if (models.length === 0) {
    return (
      <p className="text-ui-base text-foreground-subtle">
        {intl.formatMessage({ id: "claudeCode.noModels" })}
      </p>
    );
  }
  return (
    <ul
      data-testid="claude-code-models"
      className="divide-y divide-input-border overflow-hidden rounded-lg border border-input-border bg-input"
    >
      {models.map((model) => {
        const meta = [
          model.contextWindow
            ? intl.formatMessage(
                { id: "claudeCode.model.context" },
                { value: formatTokens(model.contextWindow) },
              )
            : null,
          model.maxOutputTokens
            ? intl.formatMessage(
                { id: "claudeCode.model.output" },
                { value: formatTokens(model.maxOutputTokens) },
              )
            : null,
          model.enabled ? null : intl.formatMessage({ id: "claudeCode.model.disabled" }),
        ].filter(Boolean);
        return (
          <li
            key={model.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2"
          >
            <span className="min-w-0 break-all font-mono text-ui-base text-foreground">
              {model.id}
            </span>
            {meta.length > 0 ? (
              <span className="shrink-0 text-ui-sm text-foreground-subtle">{meta.join(" · ")}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
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
  const icon = (kind: Busy, node: ReactNode) =>
    busy === kind ? <Spinner className="size-3.5" /> : node;

  const ready = Boolean(status?.installed && status.loggedIn);
  const shownError = error ?? status?.error ?? null;
  const badge = statusOf(status);
  const t = (id: string) => intl.formatMessage({ id });

  return (
    <div data-testid="claude-code-card" className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Terminal className="size-5 shrink-0 text-foreground-subtle" aria-hidden="true" />
            <h3 className="min-w-0 truncate text-ui-lg font-semibold text-foreground">
              {t("claudeCode.title")}
            </h3>
            <span
              data-testid="claude-code-status"
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-ui-xs font-medium ${TONE_CLASS[badge.tone]}`}
            >
              {status === null ? <Spinner className="size-3" /> : null}
              {badge.tone === "success" ? <Check className="size-3" aria-hidden="true" /> : null}
              {t(badge.labelId)}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            disabled={busy !== null}
            onClick={() => void run("refresh", () => Promise.resolve())}
          >
            {icon("refresh", <RefreshCw className="size-3.5" aria-hidden="true" />)}
            {t("claudeCode.recheck")}
          </Button>
        </div>
        <p className="text-ui-base leading-6 text-foreground-subtle">
          {t("claudeCode.description")}
        </p>
      </div>

      {shownError ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-ui-base text-destructive"
        >
          {shownError}
        </p>
      ) : null}

      {status && !status.installed ? (
        <section className="space-y-2">
          <p className="text-ui-base text-foreground">{t("claudeCode.installHint")}</p>
          <CommandLine command={INSTALL_COMMAND} />
        </section>
      ) : null}
      {status?.installed && !status.loggedIn ? (
        <section className="space-y-2">
          <p className="text-ui-base text-foreground">{t("claudeCode.loginHint")}</p>
          <CommandLine command={LOGIN_COMMAND} />
        </section>
      ) : null}

      {status?.installed ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-ui-base">
          {status.version ? (
            <Field label={t("claudeCode.field.version")}>
              <span className="font-mono">{status.version}</span>
            </Field>
          ) : null}
          {status.authMethod ? (
            <Field label={t("claudeCode.field.auth")}>{status.authMethod}</Field>
          ) : null}
          {status.subscriptionType ? (
            <Field label={t("claudeCode.field.plan")}>{status.subscriptionType}</Field>
          ) : null}
        </dl>
      ) : null}

      {status?.enabled ? (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-ui-base text-foreground-subtle">
              {t("claudeCode.modelsTitle")}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy !== null || !ready}
              onClick={() => void run("sync", () => claudeCodeService.syncModels())}
            >
              {icon("sync", <RefreshCw className="size-3.5" aria-hidden="true" />)}
              {t("claudeCode.sync")}
            </Button>
          </div>
          <ModelList models={status.models ?? []} />
        </section>
      ) : ready ? (
        <section className="space-y-3">
          <p className="text-ui-base text-foreground-subtle">{t("claudeCode.enableHint")}</p>
          <Button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("enable", () => claudeCodeService.enable())}
          >
            {icon("enable", <Power className="size-3.5" aria-hidden="true" />)}
            {t("claudeCode.enable")}
          </Button>
        </section>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-border pt-4">
        <p className="min-w-0 flex-1 text-ui-sm leading-5 text-foreground-subtlest">
          {t("claudeCode.hint")}
        </p>
        {status?.enabled ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-destructive hover:text-destructive"
            disabled={busy !== null}
            onClick={() => void run("disable", () => claudeCodeService.disable())}
          >
            {icon("disable", <Trash2 className="size-3.5" aria-hidden="true" />)}
            {t("claudeCode.disable")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
