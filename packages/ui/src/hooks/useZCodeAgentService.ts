import type { IZCodeAgentService } from "@zcode/services";
import { useOptionalWorkspaceServices } from "@/hooks/useWorkspaceServices.js";

export function useZCodeAgentService(
  workspacePath?: string,
  preferredRemoteSessionId?: string | null,
  workspaceIdentity?: string | null,
): IZCodeAgentService {
  const services = useOptionalWorkspaceServices(
    workspacePath,
    preferredRemoteSessionId,
    workspaceIdentity,
  );
  return services.zcodeAgentService;
}
