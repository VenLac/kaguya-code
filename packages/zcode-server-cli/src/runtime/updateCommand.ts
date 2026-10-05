import { updatePreparationResultSchema } from "../contracts.js";
import { requestControl } from "../ipc/controlClient.js";
import { createServiceLogger } from "@zcode/services/node";
import type { ServerLayout } from "./paths.js";
import { prepareOnlineUpdate } from "./updatePreparation.js";

interface UpdateCliIO {
  stdout?: { write(value: string): void };
}

function stdout(io: UpdateCliIO, value: unknown): void {
  io.stdout?.write(`${typeof value === "string" ? value : JSON.stringify(value)}\n`);
}

function isRunningTaskUpdateGuard(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes("Running tasks require --force for update")
  );
}

const log = createServiceLogger("server-update-command");

async function discardPreparedUpdateBestEffort(
  discard: (() => Promise<void>) | undefined,
): Promise<void> {
  if (!discard) return;
  try {
    await discard();
  } catch (error: unknown) {
    // 准备产物清理属于非关键收尾；直接 await discard 会让清理失败覆盖
    // running-task guard 或 control socket 的原始错误，导致用户看到错误的排障方向。
    log.warn("failed to discard prepared update after command failure", error);
  }
}

export async function runUpdateCommand(
  argv: readonly string[],
  io: UpdateCliIO,
  json: boolean,
  layout: ServerLayout,
  applyUpdate: () => Promise<number>,
): Promise<number> {
  const force = argv.includes("--force");
  let discardPreparedUpdate: (() => Promise<void>) | undefined;
  if (!force) {
    // prepareOnlineUpdate 会下载、解压并写入 pending release；旧流程在准备完成后
    // 才由 apply-update 检查运行任务，导致 guard 拒绝时仍留下网络和磁盘副作用。先检查已知的
    // 运行任务，并在准备完成后再次检查；最终 apply-update guard 仍覆盖最后一小段竞态。
    const result = updatePreparationResultSchema.parse(
      await requestControl(layout.controlEndpoint, { command: "prepare-update" }),
    );
    if (result.status === "blocked") throw new Error("Running tasks require --force for update");
  }
  const preparation = await prepareOnlineUpdate(layout);
  discardPreparedUpdate = "discard" in preparation ? preparation.discard : undefined;
  if (preparation.status === "up-to-date") {
    if (json) stdout(io, preparation);
    else stdout(io, `Kaguya Code Server ${preparation.version} is already up to date`);
    return 0;
  }
  if (!force && discardPreparedUpdate) {
    const discard = discardPreparedUpdate;
    try {
      const result = updatePreparationResultSchema.parse(
        await requestControl(layout.controlEndpoint, { command: "prepare-update" }),
      );
      if (result.status === "blocked") {
        await discardPreparedUpdateBestEffort(discard);
        discardPreparedUpdate = undefined;
        throw new Error("Running tasks require --force for update");
      }
    } catch (error: unknown) {
      if (isRunningTaskUpdateGuard(error)) throw error;
      await discardPreparedUpdateBestEffort(discard);
      discardPreparedUpdate = undefined;
      throw error;
    }
  }
  try {
    const result = await applyUpdate();
    discardPreparedUpdate = undefined;
    return result;
  } catch (error: unknown) {
    if (isRunningTaskUpdateGuard(error)) {
      await discardPreparedUpdateBestEffort(discardPreparedUpdate);
      discardPreparedUpdate = undefined;
    }
    throw error;
  }
}
