import type { IZCodeSessionService } from "@zcode/services";
import { useOptionalWorkspaceServices } from "@/hooks/useWorkspaceServices.js";

export function useZCodeSessionService(
  workspacePath?: string,
  preferredRemoteSessionId?: string | null,
  workspaceIdentity?: string | null,
): IZCodeSessionService {
  return useOptionalWorkspaceServices(workspacePath, preferredRemoteSessionId, workspaceIdentity)
    .zcodeSessionService;
}
