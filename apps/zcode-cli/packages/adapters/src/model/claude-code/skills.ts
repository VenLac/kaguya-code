import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import { cp, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

// Kaguya 的 skill 清单由 core 以 `<system-reminder>` 注入用户消息（见 core/src/context/sections/skills.ts），
// 而这段 reminder 会被整块过滤（claude 会把它当成「藏在用户消息里的指令」）。claude 自己也有 skill 机制，
// 所以把 Kaguya 的 skill 目录以临时插件的形式交给 claude（--plugin-dir），claude 就能用它自己的 Skill 工具调用它们。

const SKILLS_HEADER = "The following skills are available for use with the Skill tool:";
const SKILL_FILE_NAME = "SKILL.md";
const MAX_SKILLS = 300;
const PLUGIN_NAME = "kaguya-skills";
const PLUGIN_DIR_PREFIX = "kaguya-claude-skills-";
/** `- name[: description][ (also loadable as x)] (file: /path/SKILL.md)`，name 里可能带 `plugin:skill` 形式的冒号。 */
const SKILL_LINE = /^- (\S+?)(?::\s|(?=\s\()|\s*$).*\(file: (.+)\)\s*$/;
const UNSAFE_DIR_NAME_CHARS = /[^A-Za-z0-9._-]/g;

export interface KaguyaSkill {
  name: string;
  /** 含 SKILL.md 的目录。 */
  directory: string;
}

/** 从提示里解析 Kaguya 的 skill 清单；取最近一次出现的清单，按目录去重。 */
export function extractKaguyaSkills(prompt: LanguageModelV3Prompt): KaguyaSkill[] {
  for (let index = prompt.length - 1; index >= 0; index -= 1) {
    const message = prompt[index];
    if (message?.role !== "user") continue;
    for (const part of message.content) {
      if (part.type !== "text" || !part.text.includes(SKILLS_HEADER)) continue;
      return parseSkillList(part.text);
    }
  }
  return [];
}

function parseSkillList(text: string): KaguyaSkill[] {
  const skills: KaguyaSkill[] = [];
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const match = SKILL_LINE.exec(line.trim());
    if (!match) continue;
    const [, name, filePath] = match;
    if (!name || !filePath || basename(filePath) !== SKILL_FILE_NAME) continue;
    const directory = dirname(filePath);
    if (seen.has(directory)) continue;
    seen.add(directory);
    skills.push({ name, directory });
    if (skills.length >= MAX_SKILLS) break;
  }
  return skills;
}

export interface SkillsPlugin {
  /** 传给 `--plugin-dir` 的目录。 */
  path: string;
  /** 删除临时目录（只删链接本身，不会动原 skill 目录）；幂等，失败不抛。 */
  cleanup(): Promise<void>;
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

/**
 * 把一组 skill 目录包装成 claude 可加载的临时插件：`skills/<名字>` 指向原目录。
 * 优先用符号链接（Windows 用 junction，无需管理员权限）；链接失败才复制整个目录。
 */
export async function createSkillsPlugin(
  skills: readonly KaguyaSkill[],
): Promise<SkillsPlugin | undefined> {
  const usable: KaguyaSkill[] = [];
  for (const skill of skills) {
    if (await exists(join(skill.directory, SKILL_FILE_NAME))) usable.push(skill);
  }
  if (usable.length === 0) return undefined;

  const root = await mkdtemp(join(tmpdir(), PLUGIN_DIR_PREFIX));
  const cleanup = (): Promise<void> =>
    rm(root, { recursive: true, force: true }).catch(() => undefined);
  try {
    await mkdir(join(root, ".claude-plugin"), { recursive: true });
    await mkdir(join(root, "skills"), { recursive: true });
    await writeFile(
      join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        name: PLUGIN_NAME,
        version: "1.0.0",
        description: "Kaguya Code skills exposed to Claude Code",
      }),
    );
    const used = new Set<string>();
    for (const skill of usable) {
      const base = skill.name.replace(UNSAFE_DIR_NAME_CHARS, "_") || "skill";
      let linkName = base;
      for (let n = 2; used.has(linkName); n += 1) linkName = `${base}-${n}`;
      used.add(linkName);
      const target = join(root, "skills", linkName);
      try {
        await symlink(skill.directory, target, process.platform === "win32" ? "junction" : "dir");
      } catch {
        await cp(skill.directory, target, { recursive: true });
      }
    }
  } catch (error) {
    await cleanup();
    throw error;
  }
  return { path: root, cleanup };
}

/** claude 给 skill 加的插件命名空间前缀；展示给用户时去掉，保持和 Kaguya 里一致的名字。 */
export function stripSkillNamespace(skill: string): string {
  const prefix = `${PLUGIN_NAME}:`;
  return skill.startsWith(prefix) ? skill.slice(prefix.length) : skill;
}
