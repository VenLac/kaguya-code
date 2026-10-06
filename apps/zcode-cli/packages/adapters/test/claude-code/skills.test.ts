import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import {
  createSkillsPlugin,
  extractKaguyaSkills,
  stripSkillNamespace,
} from "../../src/model/claude-code/skills.ts";

const reminder = (body: string) =>
  `<system-reminder>\nThe following skills are available for use with the Skill tool:\n\n${body}\n</system-reminder>`;
const promptWith = (...texts: string[]): LanguageModelV3Prompt => [
  { role: "user", content: texts.map((text) => ({ type: "text" as const, text })) },
];

test("解析 Kaguya 的 skill 清单：带描述、别名后缀、plugin:skill 形式的名字", () => {
  const skills = extractKaguyaSkills(
    promptWith(
      reminder(
        [
          "- browser-use:control-browser: Use when opening pages... (also loadable as control-browser) (file: /p/browser/skills/control-browser/SKILL.md)",
          "- find-skills: Helps users discover skills (file: /home/u/.agents/skills/find-skills/SKILL.md)",
          "- plain (file: /s/plain/SKILL.md)",
        ].join("\n"),
      ),
      "real question",
    ),
  );
  assert.deepEqual(skills, [
    { name: "browser-use:control-browser", directory: "/p/browser/skills/control-browser" },
    { name: "find-skills", directory: "/home/u/.agents/skills/find-skills" },
    { name: "plain", directory: "/s/plain" },
  ]);
});

test("忽略不是 SKILL.md 的条目、按目录去重、没有清单时返回空", () => {
  assert.deepEqual(
    extractKaguyaSkills(
      promptWith(
        reminder(
          "- a: x (file: /s/a/README.md)\n- b: y (file: /s/b/SKILL.md)\n- b2: y (file: /s/b/SKILL.md)",
        ),
      ),
    ),
    [{ name: "b", directory: "/s/b" }],
  );
  assert.deepEqual(extractKaguyaSkills(promptWith("no skills here")), []);
});

test("多次出现时取最近一次的清单（技能可能在会话中变化）", () => {
  const prompt: LanguageModelV3Prompt = [
    {
      role: "user",
      content: [{ type: "text", text: reminder("- old: x (file: /s/old/SKILL.md)") }],
    },
    { role: "assistant", content: [{ type: "text", text: "hi" }] },
    {
      role: "user",
      content: [{ type: "text", text: reminder("- new: x (file: /s/new/SKILL.md)") }],
    },
  ];
  assert.deepEqual(extractKaguyaSkills(prompt), [{ name: "new", directory: "/s/new" }]);
});

let root: string;
before(async () => {
  root = await mkdtemp(join(tmpdir(), "skills-test-"));
});
after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function makeSkill(name: string): Promise<string> {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: d\n---\nbody`);
  await writeFile(join(directory, "helper.txt"), "sibling file");
  return directory;
}

test("生成临时插件：plugin.json + 指向原目录的链接；清理只删链接，不动原 skill", async () => {
  const a = await makeSkill("alpha");
  const b = await makeSkill("beta");
  const plugin = await createSkillsPlugin([
    { name: "alpha", directory: a },
    { name: "ns:beta", directory: b },
    { name: "missing", directory: join(root, "missing-dir") },
  ]);
  assert.ok(plugin);
  const manifest = JSON.parse(
    await readFile(join(plugin.path, ".claude-plugin", "plugin.json"), "utf8"),
  );
  assert.equal(manifest.name, "kaguya-skills");
  assert.deepEqual(
    (await readdir(join(plugin.path, "skills"))).sort(),
    ["alpha", "ns_beta"],
    "目录名做了安全替换，缺失的 skill 被跳过",
  );
  assert.equal(await readlink(join(plugin.path, "skills", "alpha")), a);
  assert.equal(
    await readFile(join(plugin.path, "skills", "alpha", "helper.txt"), "utf8"),
    "sibling file",
    "skill 的同级文件可通过链接访问",
  );

  await plugin.cleanup();
  await plugin.cleanup(); // 幂等
  assert.equal(
    await lstat(plugin.path).then(
      () => true,
      () => false,
    ),
    false,
  );
  assert.equal(
    await readFile(join(a, "SKILL.md"), "utf8").then((t) => t.includes("body")),
    true,
    "原 skill 目录必须完好",
  );
});

test("同名 skill 的链接不会互相覆盖；没有可用 skill 时不创建插件", async () => {
  const a = await makeSkill("dup-a");
  const b = await makeSkill("dup-b");
  const plugin = await createSkillsPlugin([
    { name: "dup", directory: a },
    { name: "dup", directory: b },
  ]);
  assert.deepEqual((await readdir(join(plugin!.path, "skills"))).sort(), ["dup", "dup-2"]);
  await plugin!.cleanup();
  assert.equal(await createSkillsPlugin([]), undefined);
  assert.equal(await createSkillsPlugin([{ name: "x", directory: join(root, "nope") }]), undefined);
});

test("还原 claude 加的插件命名空间前缀", () => {
  assert.equal(stripSkillNamespace("kaguya-skills:pelican-notes"), "pelican-notes");
  assert.equal(stripSkillNamespace("other:thing"), "other:thing");
  assert.equal(stripSkillNamespace("plain"), "plain");
});
