import { stripSkillNamespace } from "./skills.js";
import {
  AskUserQuestionInputSchema,
  BashInputSchema,
  EditInputSchema,
  ExitPlanModeInputSchema,
  SkillInputSchema,
  GlobInputSchema,
  GrepInputSchema,
  ReadInputSchema,
  TodoWriteInputSchema,
  WebFetchInputSchema,
  WebSearchInputSchema,
  WriteInputSchema,
  type ExternalToolOutcome,
} from "@zcode/contracts";

// Claude Code 的工具与 Kaguya 的原生工具几乎同名同形（Kaguya 的工具集本就对齐 Claude Code）。
// 这里把 Claude 的 tool_use / tool_result 翻译成 Kaguya 原生的工具调用与输出形状：
// 展示卡片由「工具名 + 输出形状」决定（如带 filePath+structuredPatch 的输出自动得到 diff 卡片），
// 所以只要形状对，界面就和 Kaguya 自己执行时一模一样，历史对任何其他模型也是合法的 tool-call/tool-result 配对。

type JsonRecord = Record<string, unknown>;

/** Claude 内部的检索/元工具，只是它自己的管线，不是对用户有意义的操作：不转发。 */
const HIDDEN_CLAUDE_TOOLS: ReadonlySet<string> = new Set(["ToolSearch"]);

/** Kaguya 里同名但语义不同的工具（如 Task 在 Kaguya 是带子会话的 subagent），改名避免被当成原生工具渲染。 */
const RENAMED_CLAUDE_TOOLS: Readonly<Record<string, string>> = { Task: "ClaudeTask" };

interface NativeInputSchema {
  safeParse(value: unknown): { success: boolean };
  shape?: Record<string, unknown>;
}

interface NativeToolSpec {
  schema: NativeInputSchema;
  /** 入参里要保留的键；Claude 偶尔带 Kaguya schema 不认识的字段，直接传会被校验拒绝。 */
  keys: readonly string[];
}

const NATIVE_TOOLS: Readonly<Record<string, NativeToolSpec>> = {
  Bash: {
    schema: BashInputSchema,
    keys: ["command", "timeout", "description", "run_in_background", "dangerouslyDisableSandbox"],
  },
  Read: { schema: ReadInputSchema, keys: ["file_path", "offset", "limit", "pages"] },
  Write: { schema: WriteInputSchema, keys: ["file_path", "content"] },
  Edit: { schema: EditInputSchema, keys: ["file_path", "old_string", "new_string", "replace_all"] },
  Glob: { schema: GlobInputSchema, keys: ["pattern", "path"] },
  Grep: { schema: GrepInputSchema, keys: Object.keys(GrepInputSchema.shape) },
  WebFetch: { schema: WebFetchInputSchema, keys: ["url", "prompt"] },
  WebSearch: {
    schema: WebSearchInputSchema,
    keys: ["query", "allowed_domains", "blocked_domains"],
  },
  TodoWrite: { schema: TodoWriteInputSchema, keys: ["todos"] },
  AskUserQuestion: { schema: AskUserQuestionInputSchema, keys: ["questions"] },
  ExitPlanMode: { schema: ExitPlanModeInputSchema, keys: ["plan", "allowedPrompts"] },
  Skill: { schema: SkillInputSchema, keys: ["skill", "args"] },
};

export interface MappedToolCall {
  /** 对 Kaguya 可见的工具名。 */
  name: string;
  input: JsonRecord;
  /** 是否是 Kaguya 原生工具（输出会被翻译成原生输出形状）。 */
  native: boolean;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(input: JsonRecord, keys: readonly string[]): JsonRecord {
  const result: JsonRecord = {};
  for (const key of keys) {
    if (input[key] !== undefined) result[key] = input[key];
  }
  return result;
}

/** Claude 的 todo 项没有 priority，Kaguya 要求有；补默认值。 */
function normalizeTodos(input: JsonRecord): JsonRecord {
  const todos = Array.isArray(input.todos) ? input.todos : [];
  return {
    todos: todos.filter(isRecord).map((todo) => ({
      content: todo.content,
      status: todo.status,
      priority: todo.priority ?? "medium",
    })),
  };
}

/** claude 把 Kaguya 的 skill 挂在插件命名空间下（kaguya-skills:name）；还原成 Kaguya 里的名字。 */
function normalizeSkillInput(input: JsonRecord): JsonRecord {
  const skill = typeof input.skill === "string" ? stripSkillNamespace(input.skill) : input.skill;
  return { ...pick(input, ["args"]), skill };
}

export function isHiddenClaudeTool(name: string): boolean {
  return HIDDEN_CLAUDE_TOOLS.has(name);
}

/** 把 Claude 的 tool_use 翻译成 Kaguya 工具调用；入参对不上原生 schema 时按「未知工具」处理，保证不会被本地校验拦掉。 */
export function mapClaudeToolCall(name: string, rawInput: unknown): MappedToolCall {
  const input = isRecord(rawInput) ? rawInput : {};
  const spec = NATIVE_TOOLS[name];
  if (spec) {
    const picked =
      name === "TodoWrite"
        ? normalizeTodos(input)
        : name === "Skill"
          ? normalizeSkillInput(input)
          : pick(input, spec.keys);
    if (spec.schema.safeParse(picked).success) return { name, input: picked, native: true };
  }
  // 入参对不上原生 schema 时必须换名：名字若仍是原生工具名，AI SDK 会按该工具的 schema 校验并把调用判为非法。
  return {
    name: RENAMED_CLAUDE_TOOLS[name] ?? (spec ? `Claude${name}` : name),
    input,
    native: false,
  };
}

/** 入参流刚开始、还看不到完整入参时使用的工具名（不做入参校验）。 */
export function provisionalToolName(claudeName: string): string {
  return RENAMED_CLAUDE_TOOLS[claudeName] ?? claudeName;
}

// ---------------------------------------------------------------------------
// 结果翻译
// ---------------------------------------------------------------------------

export interface ClaudeToolResultInput {
  /** Claude 的工具名（未经改名）。 */
  claudeName: string;
  input: JsonRecord;
  /** tool_result 的文本内容（Claude 实际给模型看到的）。 */
  content: string;
  isError: boolean;
  /** user 消息上的 tool_use_result。 */
  toolUseResult: unknown;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nonNegInt(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : fallback;
}

const EXIT_CODE_PATTERN = /^Exit code (\d+)/;

function bashOutput(input: ClaudeToolResultInput, result: JsonRecord): JsonRecord {
  const exitCode = EXIT_CODE_PATTERN.exec(input.content)?.[1];
  return {
    stdout: str(result.stdout, input.isError ? "" : input.content),
    stderr: str(result.stderr),
    interrupted: result.interrupted === true,
    status: input.isError ? "failed" : "completed",
    ...(exitCode === undefined ? {} : { exitCode: Number(exitCode) }),
    ...(result.isImage === true ? { isImage: true } : {}),
    ...(result.noOutputExpected === true ? { noOutputExpected: true } : {}),
  };
}

function readOutput(result: JsonRecord): JsonRecord | undefined {
  const file = isRecord(result.file) ? result.file : undefined;
  if (result.type !== "text" || !file) return undefined;
  return {
    type: "text",
    filePath: str(file.filePath),
    content: str(file.content),
    numLines: nonNegInt(file.numLines),
    startLine: nonNegInt(file.startLine, 1),
    totalLines: nonNegInt(file.totalLines),
  };
}

function writeOutput(result: JsonRecord): JsonRecord | undefined {
  if (typeof result.filePath !== "string" || !Array.isArray(result.structuredPatch))
    return undefined;
  return {
    type: result.type === "update" ? "update" : "create",
    filePath: result.filePath,
    content: str(result.content),
    structuredPatch: result.structuredPatch,
    originalFile: typeof result.originalFile === "string" ? result.originalFile : null,
    ...(typeof result.userModified === "boolean" ? { userModified: result.userModified } : {}),
  };
}

function editOutput(result: JsonRecord): JsonRecord | undefined {
  if (typeof result.filePath !== "string" || !Array.isArray(result.structuredPatch))
    return undefined;
  return {
    filePath: result.filePath,
    oldString: str(result.oldString),
    newString: str(result.newString),
    originalFile: str(result.originalFile),
    structuredPatch: result.structuredPatch,
    userModified: result.userModified === true,
    replaceAll: result.replaceAll === true,
  };
}

function globOutput(result: JsonRecord): JsonRecord | undefined {
  if (!Array.isArray(result.filenames)) return undefined;
  const filenames = result.filenames.filter((name): name is string => typeof name === "string");
  return {
    durationMs: nonNegInt(result.durationMs),
    numFiles: nonNegInt(result.numFiles, filenames.length),
    filenames,
    truncated: result.truncated === true,
  };
}

function grepOutput(result: JsonRecord): JsonRecord | undefined {
  if (!Array.isArray(result.filenames)) return undefined;
  const filenames = result.filenames.filter((name): name is string => typeof name === "string");
  const mode =
    result.mode === "content" || result.mode === "count" ? result.mode : "files_with_matches";
  return {
    mode,
    durationMs: nonNegInt(result.durationMs),
    numFiles: nonNegInt(result.numFiles, filenames.length),
    filenames,
    ...(typeof result.content === "string" ? { content: result.content } : {}),
    ...(typeof result.numLines === "number" ? { numLines: nonNegInt(result.numLines) } : {}),
    ...(typeof result.numMatches === "number" ? { numMatches: nonNegInt(result.numMatches) } : {}),
    truncated: result.truncated === true || result.appliedLimit !== undefined,
  };
}

function webFetchOutput(result: JsonRecord): JsonRecord | undefined {
  if (typeof result.url !== "string" || typeof result.result !== "string") return undefined;
  return {
    url: result.url,
    finalUrl: result.url,
    status: nonNegInt(result.code),
    statusText: str(result.codeText),
    contentType: "",
    bytes: nonNegInt(result.bytes),
    durationMs: nonNegInt(result.durationMs),
    result: result.result,
    cacheHit: false,
    redirects: [],
    truncated: false,
  };
}

function webSearchOutput(input: ClaudeToolResultInput, result: JsonRecord): JsonRecord | undefined {
  if (!Array.isArray(result.results)) return undefined;
  const sources: { title?: string; url: string }[] = [];
  for (const group of result.results) {
    const items = isRecord(group) && Array.isArray(group.content) ? group.content : [];
    for (const item of items) {
      if (isRecord(item) && typeof item.url === "string") {
        sources.push({
          ...(typeof item.title === "string" ? { title: item.title } : {}),
          url: item.url,
        });
      }
    }
  }
  return {
    query: str(result.query, str(input.input.query)),
    results: sources,
    sources,
    summary: input.content,
    durationMs: Math.round(
      (typeof result.durationSeconds === "number" ? result.durationSeconds : 0) * 1000,
    ),
  };
}

function todoOutput(result: JsonRecord): JsonRecord | undefined {
  const toNative = (todos: unknown): JsonRecord[] =>
    (Array.isArray(todos) ? todos : []).filter(isRecord).map((todo) => ({
      content: todo.content,
      status: todo.status,
      priority: todo.priority ?? "medium",
    }));
  if (!Array.isArray(result.newTodos) && !Array.isArray(result.todos)) return undefined;
  return {
    oldTodos: toNative(result.oldTodos),
    todos: toNative(result.newTodos ?? result.todos),
  };
}

const ANSWER_LINE = /"([^"]+)"="([^"]*)"/g;

/** 优先用结构化的 answers；拿不到时从 "Q"="A" 形式的结果文本里解析。 */
function askUserQuestionOutput(
  input: ClaudeToolResultInput,
  result: JsonRecord,
): JsonRecord | undefined {
  const questions = Array.isArray(result.questions) ? result.questions : input.input.questions;
  if (!Array.isArray(questions) || questions.length === 0) return undefined;
  const answers: Record<string, string> = {};
  if (isRecord(result.answers)) {
    for (const [question, answer] of Object.entries(result.answers)) {
      if (typeof answer === "string") answers[question] = answer;
    }
  } else {
    for (const match of input.content.matchAll(ANSWER_LINE)) answers[match[1]!] = match[2]!;
  }
  return {
    questions,
    answers,
    ...(isRecord(result.annotations) ? { annotations: result.annotations } : {}),
  };
}

function exitPlanModeOutput(input: ClaudeToolResultInput): JsonRecord {
  return {
    plan: typeof input.input.plan === "string" ? input.input.plan : null,
    approved: true,
    previousMode: "plan",
    mode: "build",
  };
}

/**
 * 把 Claude 的 tool_result 翻译成 Kaguya 原生输出。
 * 拿不到结构化结果（或形状对不上）时回退到只带文本的输出：卡片仍会出现，只是没有结构化细节。
 */
export function mapClaudeToolOutcome(input: ClaudeToolResultInput): ExternalToolOutcome {
  const result = isRecord(input.toolUseResult) ? input.toolUseResult : {};
  const modelContent = input.content;

  // Bash 的非零退出码在 Kaguya 里是「执行完成但失败」，保留 stdout/stderr 供卡片展示。
  if (input.claudeName === "Bash") {
    return { success: true, output: bashOutput(input, result), modelContent };
  }
  if (input.isError) {
    return { success: false, error: modelContent || "Tool execution failed." };
  }

  const structured: unknown = (() => {
    switch (input.claudeName) {
      case "Read":
        return readOutput(result);
      case "Write":
        return writeOutput(result);
      case "Edit":
        return editOutput(result);
      case "Glob":
        return globOutput(result);
      case "Grep":
        return grepOutput(result);
      case "WebFetch":
        return webFetchOutput(result);
      case "WebSearch":
        return webSearchOutput(input, result);
      case "TodoWrite":
        return todoOutput(result);
      case "AskUserQuestion":
        return askUserQuestionOutput(input, result);
      case "ExitPlanMode":
        return exitPlanModeOutput(input);
      case "Skill":
        // 原生 Skill 输出允许直接是字符串；claude 只回传「已加载」的确认文本。
        return input.content;
      default:
        return undefined;
    }
  })();
  return { success: true, output: structured ?? { content: modelContent }, modelContent };
}
