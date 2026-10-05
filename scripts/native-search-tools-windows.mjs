import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import {
  getNativeSearchSourceArchivesForTarget,
  normalizeNativeSearchArch,
  normalizeNativeSearchPlatform,
  resolveNativeSearchBuildPlan,
} from "./native-search-tools-config.mjs";
import { downloadAndExtractSources, run } from "./native-search-tools-process.mjs";
import { verifyBuiltNativeSearchProducerOutputs } from "./native-search-tools-verify.mjs";

const windowsCmakeProject = resolve(import.meta.dirname, "native-search-tools-windows");

function toCmakePath(path) {
  return path.replaceAll("\\", "/");
}

export function resolveNativeWindowsBuildConfig({
  platform = process.platform,
  arch = process.arch,
  hostPlatform = process.platform,
  hostArch = process.arch,
  env = process.env,
} = {}) {
  const normalizedPlatform = normalizeNativeSearchPlatform(platform);
  const normalizedArch = normalizeNativeSearchArch(arch);
  const normalizedHostPlatform = normalizeNativeSearchPlatform(hostPlatform);
  const normalizedHostArch = normalizeNativeSearchArch(hostArch);

  if (normalizedPlatform !== "win32") {
    throw new Error(`native Windows search build does not support platform ${normalizedPlatform}`);
  }
  if (normalizedHostPlatform !== "win32") {
    throw new Error(
      `native Windows search build must run on Windows; host is ${normalizedHostPlatform}-${normalizedHostArch}`,
    );
  }
  return {
    arch: normalizedArch,
    cmake: env.CMAKE?.trim() || "cmake",
    generator: "Visual Studio 17 2022",
    generatorArchitecture: normalizedArch === "arm64" ? "ARM64" : "x64",
    hostArch: normalizedHostArch,
    platform: normalizedPlatform,
  };
}

export function buildNativeSearchToolsWindows({
  platform = process.platform,
  arch = process.arch,
  hostPlatform = process.platform,
  hostArch = process.arch,
  outputDir,
  jobs = Math.max(1, Math.min(cpus().length, 8)),
  keepWorkdir = false,
  quiet = false,
  processEnv = process.env,
} = {}) {
  const config = resolveNativeWindowsBuildConfig({
    platform,
    arch,
    hostPlatform,
    hostArch,
    env: processEnv,
  });
  const plan = resolveNativeSearchBuildPlan({
    platform: config.platform,
    arch: config.arch,
    outputDir,
  });
  const workDir = mkdtempSync(join(tmpdir(), "zcode-native-search-build-"));
  const cmakeBuildDir = join(workDir, "cmake-build");
  const cmakeOutputDir = join(workDir, "cmake-output");
  const env = {
    ...processEnv,
    LANG: "C",
    LC_ALL: "C",
  };

  console.log("==> Kaguya Code native search build");
  console.log(`    target:  ${plan.platformKey}`);
  console.log(`    output:  ${plan.outputDir}`);
  console.log(`    workdir: ${workDir}`);

  try {
    const sources = downloadAndExtractSources({
      sources: getNativeSearchSourceArchivesForTarget({
        platform: plan.platform,
        arch: plan.arch,
      }),
      workDir,
      env,
      quiet,
    });
    mkdirSync(cmakeBuildDir, { recursive: true });
    mkdirSync(cmakeOutputDir, { recursive: true });

    console.log("==> Configure ugrep with MSVC/CMake");
    run(
      config.cmake,
      [
        "-S",
        windowsCmakeProject,
        "-B",
        cmakeBuildDir,
        "-G",
        config.generator,
        "-A",
        config.generatorArchitecture,
        `-DZCODE_BUILD_PATH=${toCmakePath(workDir)}`,
        `-DZCODE_UGREP_OUTPUT_DIR=${toCmakePath(cmakeOutputDir)}`,
        `-DZCODE_UGREP_SOURCE_DIR=${toCmakePath(sources.ugrep)}`,
        `-DZCODE_PCRE2_SOURCE_DIR=${toCmakePath(sources.pcre2)}`,
        `-DZCODE_ZLIB_SOURCE_DIR=${toCmakePath(sources.zlib)}`,
        `-DZCODE_BZIP2_SOURCE_DIR=${toCmakePath(sources.bzip2)}`,
        `-DZCODE_ZSTD_SOURCE_DIR=${toCmakePath(sources.zstd)}`,
        `-DZCODE_BROTLI_SOURCE_DIR=${toCmakePath(sources.brotli)}`,
      ],
      { env, quiet },
    );
    run(
      config.cmake,
      [
        "--build",
        cmakeBuildDir,
        "--config",
        "Release",
        "--target",
        "ugrep",
        "--parallel",
        String(jobs),
      ],
      { env, quiet },
    );

    const builtUgrepPath = join(cmakeOutputDir, "ugrep.exe");
    verifyBuiltNativeSearchProducerOutputs({
      ugrepPath: builtUgrepPath,
      platform: plan.platform,
      arch: plan.arch,
      hostArch: config.hostArch,
      producerOutputIds: plan.producerOutputIds,
    });

    mkdirSync(dirname(plan.ugrepPath), { recursive: true });
    copyFileSync(builtUgrepPath, plan.ugrepPath);
    verifyBuiltNativeSearchProducerOutputs({
      ugrepPath: plan.ugrepPath,
      platform: plan.platform,
      arch: plan.arch,
      hostArch: config.hostArch,
      producerOutputIds: plan.producerOutputIds,
    });
    console.log(`==> Built ${plan.ugrepPath}`);
    return plan;
  } finally {
    if (keepWorkdir) {
      console.log(`==> Preserved workdir ${workDir}`);
    } else {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
}
