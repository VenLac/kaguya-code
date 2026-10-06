import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isHiddenClaudeTool,
  mapClaudeToolCall,
  mapClaudeToolOutcome,
} from "../../src/model/claude-code/tool-mapping.ts";

const outcome = (
  claudeName: string,
  input: Record<string, unknown>,
  content: string,
  toolUseResult: unknown,
  isError = false,
) => mapClaudeToolOutcome({ claudeName, input, content, isError, toolUseResult });

test("原生同名工具：只保留 Kaguya schema 认识的字段", () => {
  assert.deepEqual(mapClaudeToolCall("Write", { file_path: "/a", content: "x", extra: 1 }), {
    name: "Write",
    input: { file_path: "/a", content: "x" },
    native: true,
  });
  assert.deepEqual(
    mapClaudeToolCall("Bash", { command: "ls", description: "d", bogus: true }).input,
    { command: "ls", description: "d" },
  );
  assert.equal(
    mapClaudeToolCall("Edit", { file_path: "/a", old_string: "a", new_string: "b" }).native,
    true,
  );
});

test("TodoWrite：补上 Kaguya 要求的 priority", () => {
  const mapped = mapClaudeToolCall("TodoWrite", {
    todos: [{ content: "a", status: "pending", activeForm: "Doing a" }],
  });
  assert.equal(mapped.native, true);
  assert.deepEqual(mapped.input, {
    todos: [{ content: "a", status: "pending", priority: "medium" }],
  });
});

test("入参对不上原生 schema、或 Kaguya 里语义不同的工具：不当作原生工具", () => {
  const bad = mapClaudeToolCall("Write", { file_path: 1 });
  assert.equal(bad.native, false);
  assert.equal(bad.name, "ClaudeWrite", "改名后才不会被 AI SDK 按 Write 的 schema 判为非法");
  const task = mapClaudeToolCall("Task", { description: "d", prompt: "p" });
  assert.equal(task.native, false);
  assert.equal(
    task.name,
    "ClaudeTask",
    "Kaguya 的 Task 是带子会话的 subagent，不能被当成原生 Task 渲染",
  );
  assert.equal(mapClaudeToolCall("NotebookEdit", { a: 1 }).name, "NotebookEdit");
  assert.equal(isHiddenClaudeTool("ToolSearch"), true);
  assert.equal(isHiddenClaudeTool("Write"), false);
});

test("Write / Edit：Claude 的结构化结果与原生输出同形，diff 数据原样带过去", () => {
  const patch = [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["-a", "+b"] }];
  const edit = outcome("Edit", {}, "edited", {
    filePath: "/a",
    oldString: "a",
    newString: "b",
    originalFile: "a",
    structuredPatch: patch,
    userModified: false,
    replaceAll: false,
    extra: 1,
  });
  assert.deepEqual(edit, {
    success: true,
    modelContent: "edited",
    output: {
      filePath: "/a",
      oldString: "a",
      newString: "b",
      originalFile: "a",
      structuredPatch: patch,
      userModified: false,
      replaceAll: false,
    },
  });
  const write = outcome("Write", {}, "created", {
    type: "create",
    filePath: "/a",
    content: "x",
    structuredPatch: [],
    originalFile: null,
    userModified: false,
    memdirStamped: true,
  });
  assert.deepEqual((write as { output: unknown }).output, {
    type: "create",
    filePath: "/a",
    content: "x",
    structuredPatch: [],
    originalFile: null,
    userModified: false,
  });
});

test("Bash：stdout/stderr/interrupted 原样，非零退出码保留为「执行完成但失败」", () => {
  assert.deepEqual(
    outcome("Bash", {}, "a\nb", { stdout: "a\nb", stderr: "", interrupted: false }),
    {
      success: true,
      modelContent: "a\nb",
      output: { stdout: "a\nb", stderr: "", interrupted: false, status: "completed" },
    },
  );
  const failed = outcome(
    "Bash",
    {},
    "Exit code 2\nboom",
    { stdout: "", stderr: "boom", interrupted: false },
    true,
  ) as { success: boolean; output: Record<string, unknown> };
  assert.equal(failed.success, true);
  assert.equal(failed.output.exitCode, 2);
  assert.equal(failed.output.status, "failed");
  assert.equal(failed.output.stderr, "boom");
});

test("Read / Glob / Grep / WebFetch / WebSearch / TodoWrite 的翻译", () => {
  assert.deepEqual(
    (
      outcome("Read", {}, "1\thi", {
        type: "text",
        file: { filePath: "/a", content: "hi", numLines: 1, startLine: 1, totalLines: 1 },
      }) as { output: unknown }
    ).output,
    { type: "text", filePath: "/a", content: "hi", numLines: 1, startLine: 1, totalLines: 1 },
  );
  assert.deepEqual(
    (
      outcome("Glob", {}, "a\nb", {
        filenames: ["a", "b"],
        numFiles: 2,
        durationMs: 3,
        truncated: false,
      }) as { output: unknown }
    ).output,
    { durationMs: 3, numFiles: 2, filenames: ["a", "b"], truncated: false },
  );
  const grep = (
    outcome("Grep", {}, "x", {
      mode: "content",
      filenames: ["f"],
      numFiles: 1,
      content: "f:1:x",
      numLines: 1,
    }) as { output: Record<string, unknown> }
  ).output;
  assert.equal(grep.mode, "content");
  assert.equal(grep.content, "f:1:x");
  const fetched = (
    outcome("WebFetch", {}, "ok", {
      url: "https://e.com",
      code: 200,
      codeText: "OK",
      bytes: 5,
      durationMs: 9,
      result: "page",
    }) as { output: Record<string, unknown> }
  ).output;
  assert.equal(fetched.status, 200);
  assert.equal(fetched.result, "page");
  const search = (
    outcome("WebSearch", { query: "q" }, "summary", {
      query: "q",
      results: [{ content: [{ title: "T", url: "https://u" }] }],
      durationSeconds: 1.5,
    }) as { output: Record<string, unknown> }
  ).output;
  assert.deepEqual(search.sources, [{ title: "T", url: "https://u" }]);
  assert.equal(search.durationMs, 1500);
  const todos = (
    outcome("TodoWrite", {}, "ok", {
      oldTodos: [],
      newTodos: [{ content: "a", status: "pending", activeForm: "A" }],
    }) as { output: { todos: unknown[] } }
  ).output;
  assert.deepEqual(todos.todos, [{ content: "a", status: "pending", priority: "medium" }]);
});

test("没有结构化结果或形状对不上：回退为只带文本的输出，卡片仍会出现", () => {
  assert.deepEqual(outcome("Write", {}, "created", undefined), {
    success: true,
    modelContent: "created",
    output: { content: "created" },
  });
  assert.deepEqual(outcome("Mystery", {}, "text", { foo: 1 }), {
    success: true,
    modelContent: "text",
    output: { content: "text" },
  });
});

test("非 Bash 工具失败（含用户拒绝权限）：返回失败并带上原因", () => {
  assert.deepEqual(outcome("Write", {}, "denied by user", undefined, true), {
    success: false,
    error: "denied by user",
  });
});

test("AskUserQuestion / ExitPlanMode：入参保留原生字段，答案与计划翻译成原生输出", () => {
  const questions = [
    {
      question: "Color?",
      header: "Color",
      multiSelect: false,
      options: [
        { label: "Red", description: "r" },
        { label: "Blue", description: "b" },
      ],
    },
  ];
  const mapped = mapClaudeToolCall("AskUserQuestion", { questions, extra: 1 });
  assert.equal(mapped.native, true);
  assert.deepEqual(mapped.input, { questions });
  const answered = outcome(
    "AskUserQuestion",
    { questions },
    'User has answered: "Color?"="Blue".',
    { questions, answers: { "Color?": "Blue" } },
  ) as { output: Record<string, unknown> };
  assert.deepEqual(answered.output, { questions, answers: { "Color?": "Blue" } });
  const parsed = outcome(
    "AskUserQuestion",
    { questions },
    'User has answered your questions: "Color?"="Red", "Size?"="L". Continue.',
    undefined,
  ) as { output: { answers: Record<string, string> } };
  assert.deepEqual(parsed.output.answers, { "Color?": "Red", "Size?": "L" });

  assert.equal(mapClaudeToolCall("ExitPlanMode", { plan: "1. do it" }).native, true);
  const plan = outcome("ExitPlanMode", { plan: "1. do it" }, "approved", undefined) as {
    output: Record<string, unknown>;
  };
  assert.deepEqual(plan.output, {
    plan: "1. do it",
    approved: true,
    previousMode: "plan",
    mode: "build",
  });
  assert.deepEqual(
    outcome("ExitPlanMode", { plan: "p" }, "user rejected the plan", undefined, true),
    { success: false, error: "user rejected the plan" },
  );
});

test("Skill：还原 Kaguya 里的名字，输出为原生 Skill 的字符串形式", () => {
  const mapped = mapClaudeToolCall("Skill", { skill: "kaguya-skills:pelican-notes", args: "x" });
  assert.equal(mapped.native, true);
  assert.deepEqual(mapped.input, { skill: "pelican-notes", args: "x" });
  assert.deepEqual(
    outcome("Skill", { skill: "pelican-notes" }, "Launching skill: pelican-notes", {
      success: true,
      commandName: "pelican-notes",
    }),
    {
      success: true,
      output: "Launching skill: pelican-notes",
      modelContent: "Launching skill: pelican-notes",
    },
  );
});
