import {
  FileDisplayIcon,
  getFileDisplayPath,
  resolveFileDisplayDescriptor,
} from "@/lib/fileDisplay.js";
import { FlipMetricValue } from "@/components/ui/flip-metric-value.js";
import { getPathLeaf } from "@/lib/path.js";
import { inferEditOperation } from "@/ToolCallBlocks/fileSummaries.js";
import type {
  EditKindSource,
  EditKindLabelId,
  EditOperationKind,
  RawToolCallFileSummary,
} from "@/ToolCallBlocks/fileSummaryTypes.js";

export function renderDiffCount(
  changeStat?: {
    added: number;
    removed: number;
  },
  options?: { animateInitial?: boolean },
) {
  if (!changeStat) {
    return null;
  }

  if (changeStat.added <= 0 && changeStat.removed <= 0) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono leading-none tabular-nums">
      {changeStat.added > 0 ? (
        <span
          aria-label={`+${changeStat.added}`}
          className="inline-flex items-center text-diff-added"
          role="text"
          title={`+${changeStat.added}`}
        >
          +{/* 性能修复：投影已按秒给出真实统计，数字只做一次短翻页，不再逐行 rAF 追赶。 */}
          <FlipMetricValue
            value={String(changeStat.added)}
            animateInitial={options?.animateInitial}
          />
        </span>
      ) : null}
      {changeStat.removed > 0 ? (
        <span
          aria-label={`-${changeStat.removed}`}
          className="inline-flex items-center text-diff-removed"
          role="text"
          title={`-${changeStat.removed}`}
        >
          -
          <FlipMetricValue
            value={String(changeStat.removed)}
            animateInitial={options?.animateInitial}
          />
        </span>
      ) : null}
    </span>
  );
}

export function renderFileChip({
  summary,
  clickable = false,
  onClick,
  title,
  basePath,
}: {
  summary: RawToolCallFileSummary;
  clickable?: boolean;
  onClick?: () => void;
  title?: string;
  basePath?: string;
}) {
  const descriptor = resolveFileDisplayDescriptor(summary.path, {
    basePath,
  });
  const chipTitle = title ?? getFileDisplayPath(summary.path, basePath);
  // 修复说明：文件名与其后的父目录路径同为 min-w-0，flex 按内容宽度比例收缩，
  // 长路径会连带把短文件名截成「a…」（Write/Edit 行右侧还有 diff 计数，更明显）。
  // 文件名是主识别信息：不参与收缩（仍以 max-w-full 为上限），只让次要路径截断。

  if (clickable) {
    return (
      <button
        type="button"
        className="inline-flex min-w-0 max-w-full shrink-0 items-center gap-1.5 text-foreground-subtle hover:underline"
        title={chipTitle}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.();
        }}
      >
        <FileDisplayIcon src={descriptor.fileIconSrc} size={16} className="size-4 shrink-0" />
        <span className="min-w-0 truncate text-foreground-subtle">{getPathLeaf(summary.path)}</span>
      </button>
    );
  }

  return (
    <span
      className="inline-flex min-w-0 max-w-full shrink-0 items-center gap-1.5 text-foreground-subtle"
      title={chipTitle}
    >
      <FileDisplayIcon src={descriptor.fileIconSrc} size={16} className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{getPathLeaf(summary.path)}</span>
    </span>
  );
}

export function renderFilePath(path: string | null | undefined, basePath?: string) {
  if (!path) {
    return null;
  }

  return (
    <span className="min-w-0 truncate text-foreground-subtlest @max-[360px]/conversation:hidden">
      {/* 窄会话流里父目录会与文件名争抢空间，Read/Edit 最终只剩动作标签和省略号。
          小容器隐藏次要路径，让文件名继续承担主识别信息。 */}
      {getFileDisplayPath(path, basePath)}
    </span>
  );
}

export function getEditKindLabelMessageId(
  operationKinds: EditOperationKind[],
  actionLabels: Array<RawToolCallFileSummary["actionLabel"]>,
  isRunning: boolean,
  source?: EditKindSource,
): EditKindLabelId {
  const inferredOperation = inferEditOperation(operationKinds, actionLabels, source);

  if (inferredOperation === "write") {
    return isRunning ? "chat.toolCall.edit.writing" : "chat.toolCall.kind.write";
  }

  if (inferredOperation === "delete") {
    return isRunning ? "chat.toolCall.edit.deleting" : "chat.toolCall.kind.delete";
  }

  if (actionLabels.length === 0) {
    return isRunning ? "chat.toolCall.edit.editing" : "chat.toolCall.kind.edit";
  }

  return isRunning ? "chat.toolCall.edit.editing" : "chat.toolCall.kind.edit";
}

export function renderJoinedFileChips(
  summaries: RawToolCallFileSummary[],
  options: {
    clickable?: boolean;
    onClick?: (summary: RawToolCallFileSummary) => void;
    basePath?: string;
  } = {},
) {
  return (
    // 单个文件时外层同样不参与收缩（见 renderFileChip 的修复说明），只让父目录路径截断；
    // 多个文件仍按比例收缩，避免挤掉其余文件名。
    <div
      className={
        summaries.length === 1
          ? "inline-flex min-w-0 max-w-full shrink-0 items-center"
          : "inline-flex min-w-0 items-center"
      }
    >
      {summaries.map((summary, index) => (
        <span key={summary.path} className="inline-flex min-w-0 items-center">
          {index > 0 ? <span className="mx-1 text-foreground-subtlest">,</span> : null}
          {renderFileChip({
            summary,
            clickable: options.clickable,
            basePath: options.basePath,
            onClick: options.onClick ? () => options.onClick?.(summary) : undefined,
          })}
        </span>
      ))}
    </div>
  );
}
