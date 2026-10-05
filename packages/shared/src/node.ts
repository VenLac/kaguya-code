/**
 * Node-only shared utilities.
 *
 * This subpath must not be imported by renderer/browser bundles.
 */
export { acquireFileLock } from "./node/atomicFileLock.js";
export { scanOfficialPluginCacheRoots } from "./node/officialPluginCache.js";
export {
  migrateUserSubagentMarkdown,
  migrateSubagentStateFile,
} from "./node/subagentMarkdownMigration.js";
export {
  atomicWritePrivateTextFile,
  backupCorruptFile,
  withFileLock,
  type SharedFileLockOptions,
} from "./node/privateFilePersistence.js";
export {
  createNodeSelfResourceSampler,
  NODE_SELF_RESOURCE_SAMPLE_INTERVAL_MS,
  type NodeSelfResourceSampler,
  type NodeSelfResourceSamplerOptions,
} from "./node/nodeSelfResourceTelemetry.js";
export {
  CODEX_API_BASE_URL,
  CODEX_OAUTH_CLIENT_ID,
  CODEX_OAUTH_PORT,
  CODEX_OAUTH_REDIRECT_URI,
  CodexAuthError,
  adaptCodexRequestBody,
  buildCodexAuthRecord,
  buildCodexAuthorizeUrl,
  clearCodexAuth,
  createCodexAuthFetch,
  createPkcePair,
  decodeJwtPayload,
  ensureFreshCodexAuth,
  isCodexBaseUrl,
  readCodexAuth,
  refreshCodexTokens,
  resolveCodexAuthPath,
  startCodexLogin,
  writeCodexAuth,
  type CodexAuthRecord,
  type CodexFetch,
  type CodexLoginSession,
} from "./node/codexAuth.js";
