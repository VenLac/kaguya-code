import { readFile } from "node:fs/promises";
import type { ReleaseManager } from "./releaseManager.js";

export async function recoverSupervisorStartup(
  releaseManager: ReleaseManager,
  uninstalledFile: string,
  serverRoot: string,
  onRecoveryFailure: (error: unknown) => Promise<void>,
): Promise<void> {
  await readFile(uninstalledFile, "utf8")
    .then(() => {
      throw new Error(`Kaguya Code Server has been uninstalled: ${serverRoot}`);
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    });
  try {
    await releaseManager.recoverInterruptedUpdate();
  } catch (error: unknown) {
    await onRecoveryFailure(error);
    throw error;
  }
}
