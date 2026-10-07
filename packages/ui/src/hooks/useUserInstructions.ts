import type { UserInstructionsSnapshot, UserInstructionsWriteResult } from "@zcode/services";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServices } from "@/hooks/useServices.js";

type UserInstructionsLoadState = "loading" | "ready" | "error";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 全局 AGENTS.md 的读写入口。磁盘文件由 IUserInstructionsService 持有；
 * 这里只缓存最近一次读到/保存成功的快照，作为编辑草稿对比和乐观并发的基线。
 */
export function useUserInstructions() {
  const { userInstructionsService } = useServices();
  const [snapshot, setSnapshot] = useState<UserInstructionsSnapshot | null>(null);
  const [loadState, setLoadState] = useState<UserInstructionsLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadState("loading");
    setLoadError(null);
    try {
      const next = await userInstructionsService.read();
      // 卸载或后发请求之后，旧响应不能覆盖基线。
      if (requestIdRef.current !== requestId) return;
      setSnapshot(next);
      setLoadState("ready");
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      setLoadError(getErrorMessage(error));
      setLoadState("error");
    }
  }, [userInstructionsService]);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  const write = useCallback(
    (content: string, expectedRevision: string | null): Promise<UserInstructionsWriteResult> =>
      userInstructionsService.write({ content, expectedRevision }),
    [userInstructionsService],
  );

  return { snapshot, setSnapshot, loadState, loadError, reload, write };
}
