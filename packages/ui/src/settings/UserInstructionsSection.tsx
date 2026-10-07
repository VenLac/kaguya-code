import { USER_INSTRUCTIONS_MAX_BYTES, type UserInstructionsSnapshot } from "@zcode/services";
import {
  TID_SETTINGS_USER_INSTRUCTIONS_CONFLICT,
  TID_SETTINGS_USER_INSTRUCTIONS_CONFLICT_OVERWRITE,
  TID_SETTINGS_USER_INSTRUCTIONS_CONFLICT_RELOAD,
  TID_SETTINGS_USER_INSTRUCTIONS_EDITOR,
  TID_SETTINGS_USER_INSTRUCTIONS_REVERT,
  TID_SETTINGS_USER_INSTRUCTIONS_SAVE,
} from "@zcode/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { toast } from "@/components/ui/toast.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useUserInstructions } from "@/hooks/useUserInstructions.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { registerSettingsLeaveGuard } from "@/lib/settingsLeaveGuard.js";
import { logger } from "@/logger.js";
import { SettingsGroupCard } from "@/settings/SettingsPageParts.js";

const textEncoder = new TextEncoder();

function formatKiB(bytes: number): string {
  return (bytes / 1024).toFixed(1);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 全局 AGENTS.md（~/.zcode/AGENTS.md）编辑器。
 *
 * 磁盘文件是唯一事实来源，草稿只是本组件的局部状态：`draft === null` 表示“与基线一致”，
 * 这样基线（snapshot）更新后不需要再同步一份草稿副本。
 */
export function UserInstructionsSection() {
  const { intl } = useZCodeIntl();
  const confirmDialog = useConfirmDialog();
  const { snapshot, setSnapshot, loadState, loadError, reload, write } = useUserInstructions();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 保存时发现磁盘内容已被外部改动：保留草稿，展示行内提示由用户选择覆盖或载入磁盘版本。
  const [conflict, setConflict] = useState<UserInstructionsSnapshot | null>(null);

  const value = draft ?? snapshot?.content ?? "";
  const dirty = snapshot !== null && draft !== null && draft !== snapshot.content;
  const bytes = useMemo(() => textEncoder.encode(value).byteLength, [value]);
  const overLimit = bytes > USER_INSTRUCTIONS_MAX_BYTES;

  useEffect(() => {
    if (!dirty) return;
    // 草稿会随分区卸载丢失，所以切换分区/返回前必须确认。
    return registerSettingsLeaveGuard(() =>
      confirmDialog({
        title: intl.formatMessage({ id: "settings.userInstructions.unsaved.title" }),
        description: intl.formatMessage({ id: "settings.userInstructions.unsaved.description" }),
        confirmLabel: intl.formatMessage({ id: "settings.userInstructions.unsaved.discard" }),
        confirmVariant: "destructive",
        showCloseButton: true,
        showKeyboardHints: false,
      }),
    );
  }, [confirmDialog, dirty, intl]);

  const resetDraft = useCallback(() => {
    setDraft(null);
    setConflict(null);
    setSaveError(null);
  }, []);

  const save = useCallback(
    async (mode: "normal" | "overwrite") => {
      if (!snapshot || saving || !dirty || overLimit) return;
      // 覆盖保存以“冲突时看到的磁盘版本”为基线：用户已明确知道并接受覆盖那份内容。
      const expectedRevision =
        mode === "overwrite" && conflict ? conflict.revision : snapshot.revision;
      setSaving(true);
      setSaveError(null);
      try {
        const result = await write(value, expectedRevision);

        if (result.status === "saved") {
          setSnapshot(result.snapshot);
          resetDraft();
          toast(intl.formatMessage({ id: "settings.userInstructions.saved" }));
        } else if (result.status === "conflict") {
          setConflict(result.snapshot);
        } else {
          setSaveError(
            intl.formatMessage(
              { id: "settings.userInstructions.tooLarge" },
              { bytes: formatKiB(result.bytes), max: formatKiB(result.maxBytes) },
            ),
          );
        }
      } catch (error) {
        logger.warn("[UserInstructionsSection] 保存全局 AGENTS.md 失败", error);
        setSaveError(
          intl.formatMessage(
            { id: "settings.userInstructions.saveFailed" },
            { error: getErrorMessage(error) },
          ),
        );
      } finally {
        setSaving(false);
      }
    },
    [conflict, dirty, intl, overLimit, resetDraft, saving, setSnapshot, snapshot, value, write],
  );

  const loadDiskVersion = useCallback(() => {
    if (!conflict) return;
    setSnapshot(conflict);
    resetDraft();
  }, [conflict, resetDraft, setSnapshot]);

  if (loadState === "error") {
    return (
      <div className="space-y-3">
        <Alert variant="warning">
          <AlertDescription>
            {intl.formatMessage(
              { id: "settings.userInstructions.loadFailed" },
              { error: loadError ?? "" },
            )}
          </AlertDescription>
        </Alert>
        <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
          {intl.formatMessage({ id: "common.retry" })}
        </Button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-ui-base text-foreground-subtle">
        {intl.formatMessage({ id: "common.loading" })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-ui-base leading-6 text-foreground-subtle">
        {intl.formatMessage({ id: "settings.userInstructions.description" })}
      </p>

      {conflict ? (
        <Alert variant="warning" data-testid={TID_SETTINGS_USER_INSTRUCTIONS_CONFLICT}>
          <AlertTitle>
            {intl.formatMessage({ id: "settings.userInstructions.conflict.title" })}
          </AlertTitle>
          <AlertDescription>
            <p>{intl.formatMessage({ id: "settings.userInstructions.conflict.description" })}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                data-testid={TID_SETTINGS_USER_INSTRUCTIONS_CONFLICT_OVERWRITE}
                onClick={() => void save("overwrite")}
              >
                {intl.formatMessage({ id: "settings.userInstructions.conflict.overwrite" })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                data-testid={TID_SETTINGS_USER_INSTRUCTIONS_CONFLICT_RELOAD}
                onClick={loadDiskVersion}
              >
                {intl.formatMessage({ id: "settings.userInstructions.conflict.reload" })}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <SettingsGroupCard>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-ui-sm text-foreground-subtle">
            <span className="min-w-0 break-all" title={snapshot.path}>
              {snapshot.path}
              {snapshot.exists
                ? null
                : ` · ${intl.formatMessage({ id: "settings.userInstructions.notCreated" })}`}
            </span>
            <span className={overLimit ? "text-destructive" : undefined}>
              {intl.formatMessage(
                { id: "settings.userInstructions.size" },
                { used: formatKiB(bytes), max: formatKiB(USER_INSTRUCTIONS_MAX_BYTES) },
              )}
            </span>
          </div>

          <Textarea
            value={value}
            spellCheck={false}
            aria-label={intl.formatMessage({ id: "settings.userInstructions.title" })}
            aria-invalid={overLimit || undefined}
            placeholder={intl.formatMessage({ id: "settings.userInstructions.placeholder" })}
            data-testid={TID_SETTINGS_USER_INSTRUCTIONS_EDITOR}
            className="field-sizing-fixed h-96 min-h-48 resize-y border-input-border bg-input px-3 py-2 font-mono text-mobile-input-safe leading-6 hover:border-input-border-hover focus-visible:border-input-border-focused focus-visible:bg-input-focused focus-visible:ring-0 md:text-ui-base"
            onChange={(event) => setDraft(event.target.value)}
          />

          {saveError ? (
            <p className="text-ui-sm text-destructive" role="alert">
              {saveError}
            </p>
          ) : null}

          <p className="text-ui-sm leading-5 text-foreground-subtlest">
            {intl.formatMessage({ id: "settings.userInstructions.appliesToNewSessions" })}
          </p>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!dirty || saving}
              data-testid={TID_SETTINGS_USER_INSTRUCTIONS_REVERT}
              onClick={resetDraft}
            >
              {intl.formatMessage({ id: "settings.userInstructions.revert" })}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!dirty || saving || overLimit}
              data-testid={TID_SETTINGS_USER_INSTRUCTIONS_SAVE}
              onClick={() => void save("normal")}
            >
              {intl.formatMessage({ id: "common.save" })}
            </Button>
          </div>
        </div>
      </SettingsGroupCard>
    </div>
  );
}
