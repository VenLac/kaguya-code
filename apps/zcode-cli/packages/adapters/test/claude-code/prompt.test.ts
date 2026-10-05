import assert from "node:assert/strict";
import { test } from "node:test";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import { buildClaudeContent, extractSystemPrompt } from "../../src/model/claude-code/prompt.ts";

const text = (t: string) => ({ type: "text" as const, text: t });
const prompt: LanguageModelV3Prompt = [
  { role: "system", content: "SYS" },
  { role: "user", content: [text("q1")] },
  {
    role: "assistant",
    content: [text("a1"), { type: "tool-call", toolCallId: "t", toolName: "Bash", input: {} }],
  },
  { role: "user", content: [text("q2")] },
  { role: "user", content: [text("q3")] },
];

test("resume：只发最后一条 assistant 之后的全部用户输入，不带 system 与历史", () => {
  assert.deepEqual(buildClaudeContent(prompt, "resume"), [text("q2"), text("q3")]);
});

test("seed：新建 Claude 会话但已有历史时，转写历史（不含 system）", () => {
  const content = buildClaudeContent(prompt, "seed");
  assert.equal(content[0]?.type, "text");
  const lead = (content[0] as { text: string }).text;
  assert.match(lead, /\[user\]: q1/);
  assert.match(lead, /\[assistant\]: a1\n\[调用工具 Bash\]/);
  assert.doesNotMatch(lead, /SYS/);
  assert.deepEqual(content.slice(1), [text("q2"), text("q3")]);
});

test("ephemeral：历史转写进上下文，但 system 不进用户消息（另走 system prompt）", () => {
  const content = buildClaudeContent(prompt, "ephemeral");
  const lead = (content[0] as { text: string }).text;
  assert.match(lead, /\[user\]: q1/);
  assert.doesNotMatch(lead, /SYS/);
  assert.equal(extractSystemPrompt(prompt), "SYS");
  assert.equal(extractSystemPrompt([{ role: "user", content: [text("x")] }]), undefined);
  assert.equal(
    extractSystemPrompt([
      { role: "system", content: "A" },
      { role: "system", content: " B " },
      { role: "user", content: [text("x")] },
    ]),
    "A\n\nB",
  );
});

test("没有历史时 seed 与 resume 等价", () => {
  const single: LanguageModelV3Prompt = [{ role: "user", content: [text("hi")] }];
  assert.deepEqual(buildClaudeContent(single, "seed"), [text("hi")]);
});

test("图片作为 base64 块传递，非图片附件降级为文字说明", () => {
  const withFiles: LanguageModelV3Prompt = [
    {
      role: "user",
      content: [
        text("look"),
        { type: "file", mediaType: "image/png", data: new Uint8Array([1, 2, 3]) },
        {
          type: "file",
          mediaType: "application/pdf",
          data: new Uint8Array([1]),
          filename: "a.pdf",
        },
        { type: "file", mediaType: "image/png", data: new URL("https://example.com/x.png") },
      ],
    },
  ];
  const content = buildClaudeContent(withFiles, "resume");
  assert.deepEqual(content[1], {
    type: "image",
    source: { type: "base64", media_type: "image/png", data: "AQID" },
  });
  assert.match((content[2] as { text: string }).text, /a\.pdf/);
  assert.match((content[3] as { text: string }).text, /未能传递/);
});

test("超长历史只保留最近部分", () => {
  const long: LanguageModelV3Prompt = [
    { role: "user", content: [text("OLD" + "x".repeat(70_000))] },
    { role: "assistant", content: [text("ok")] },
    { role: "user", content: [text("now")] },
  ];
  const lead = (buildClaudeContent(long, "seed")[0] as { text: string }).text;
  assert.match(lead, /更早的对话已省略/);
  assert.doesNotMatch(lead, /OLD/);
});

test("过滤 Kaguya 注入的整块 system-reminder，保留用户自己的正文", () => {
  const reminder = (body: string) => `<system-reminder>\n${body}\n</system-reminder>\n`;
  const injected: LanguageModelV3Prompt = [
    {
      role: "user",
      content: [
        text(reminder("skills...")),
        text(reminder("AGENTS.md ...")),
        text("real question"),
      ],
    },
  ];
  assert.deepEqual(buildClaudeContent(injected, "resume"), [text("real question")]);

  // 用户正文恰好以 <system-reminder> 开头但没有闭合时不会被误删
  const lookalike: LanguageModelV3Prompt = [
    { role: "user", content: [text("<system-reminder> is a tag I am asking about")] },
  ];
  assert.deepEqual(buildClaudeContent(lookalike, "resume"), [
    text("<system-reminder> is a tag I am asking about"),
  ]);

  // 历史转写里同样不带 reminder，且全是 reminder 的历史用户消息整条丢弃
  const history: LanguageModelV3Prompt = [
    { role: "user", content: [text(reminder("old reminder")), text("q1")] },
    { role: "assistant", content: [text("a1")] },
    { role: "user", content: [text(reminder("only reminder"))] },
    { role: "assistant", content: [text("a2")] },
    { role: "user", content: [text("q2")] },
  ];
  const lead = (buildClaudeContent(history, "seed")[0] as { text: string }).text;
  assert.doesNotMatch(lead, /reminder/);
  assert.match(lead, /\[user\]: q1/);
  assert.doesNotMatch(lead, /\[user\]: \n/);
});

test("只有 reminder 没有正文时不会发出空消息", () => {
  const onlyReminder: LanguageModelV3Prompt = [
    { role: "user", content: [text("<system-reminder>x</system-reminder>")] },
  ];
  assert.deepEqual(buildClaudeContent(onlyReminder, "resume"), []);
});
