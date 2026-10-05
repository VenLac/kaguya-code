// 把提及（@）节点用到的图标，从 DSL 生成为 mentionIconDom.ts 需要的 IconNode 数据
import fs from 'node:fs'; import { parse } from './build.mjs';
const icons = parse(fs.readFileSync('dsl/icons.txt', 'utf8'));
const MAP = { SKILL: 'wand-sparkles', SUBAGENT: 'bot', WHITEBOARD: 'palette', GOAL_COMMAND: 'goal', WORKFLOW_COMMAND: 'workflow', COMPACT_COMMAND: 'scroll-text', COMMAND: 'square-slash', SESSION: 'messages-square', PLUGIN: 'plug' };
const els = (s, extra = {}) => [...s.matchAll(/<(path|circle|rect) ([^>]*?)\/>/g)].map(m => {
  const attrs = { ...extra }; for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
  return [m[1], attrs];
});
let out = '';
for (const [k, canon] of Object.entries(MAP)) {
  const ic = icons[canon]; if (!ic) throw new Error(canon);
  const nodes = [...els(ic.tone, { fill: 'currentColor', 'fill-opacity': '0.16', stroke: 'none' }), ...els(ic.main)];
  out += `export const ${k}_MENTION_ICON_NODE = ${JSON.stringify(nodes, null, 2)} as const satisfies MentionLucideIconNode;\n`;
}
fs.writeFileSync('dsl/mention.generated.ts', out); console.log(out.length);
