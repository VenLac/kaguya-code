import { platform, arch } from "node:process";
import { SERVER_RUNTIME_NODE_VERSION } from "../contracts.js";
import { z } from "zod";

export const supportedServerTargets = [
  "darwin-x64",
  "darwin-arm64",
  "linux-x64",
  "linux-arm64",
  "win32-x64",
  "win32-arm64",
] as const;

export type ServerTarget = (typeof supportedServerTargets)[number];

export interface ServerRuntimeManifest {
  product: "zcode-server";
  target: ServerTarget;
  appVersion: string;
  nodeVersion: string;
  entrypoints: { cli: string; core: string; agent: string };
  native: string[];
  tools?: string[];
  plugins?: string[];
  components?: Array<{
    id: string;
    sha256: string;
    paths: string[];
    sizeBytes: number;
    archivePath?: string;
  }>;
}

export const serverRuntimeManifestSchema = z
  .object({
    product: z.literal("zcode-server"),
    target: z.enum(supportedServerTargets),
    appVersion: z.string().min(1),
    nodeVersion: z.string().min(1),
    entrypoints: z.object({ cli: z.string(), core: z.string(), agent: z.string() }).strict(),
    native: z.array(z.string()),
    tools: z.array(z.string()).optional(),
    plugins: z.array(z.string()).optional(),
    components: z
      .array(
        z
          .object({
            id: z.string().min(1),
            sha256: z.string().regex(/^[a-f0-9]{64}$/i),
            paths: z.array(z.string().min(1)).min(1),
            sizeBytes: z.number().int().nonnegative(),
            archivePath: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export function currentServerTarget(): ServerTarget {
  const target = `${platform}-${arch}`;
  if (!supportedServerTargets.includes(target as ServerTarget)) {
    throw new Error(`Unsupported Kaguya Code Server target: ${target}`);
  }
  return target as ServerTarget;
}

export function createRuntimeManifest(
  target = currentServerTarget(),
  appVersion = "0.0.0-dev",
  extras: Pick<ServerRuntimeManifest, "tools" | "plugins" | "components"> = {},
): ServerRuntimeManifest {
  return {
    product: "zcode-server",
    target,
    appVersion,
    nodeVersion: SERVER_RUNTIME_NODE_VERSION,
    // 入口是 ESM `.js`（tsup 产物）：server-cli 通过 `new URL("./server-core.js")` fork Core、
    // 通过同目录 zcode.cjs 委派既有 CLI，三者必须同目录且文件名与产物一致。
    entrypoints: {
      cli: "runtime/server-cli.js",
      core: "runtime/server-core.js",
      agent: "runtime/zcode.cjs",
    },
    native: ["node-pty"],
    ...extras,
  };
}
