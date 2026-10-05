// 由 DSL 与别名分组生成 src/generated.ts（图标数据 + 导出名映射）与 src/exports.generated.ts
import fs from 'node:fs'; import { parse } from './build.mjs';
const icons = parse(fs.readFileSync('dsl/icons.txt', 'utf8'));
const groups = JSON.parse(fs.readFileSync('dsl/groups.json', 'utf8'));
const data = Object.entries(icons).map(([n, v]) => `  ${JSON.stringify(n)}: [${JSON.stringify(v.tone)}, ${JSON.stringify(v.main)}],`).join('\n');
fs.writeFileSync('src/generated.ts', `// 自动生成，勿手改。来源：dsl/icons.txt（node tools/gen.mjs）\nexport const ICON_DATA: Record<string, readonly [tone: string, main: string]> = {\n${data}\n};\n`);
const lines = []; let n = 0;
for (const g of groups) {
  const canon = g.canon.find(c => icons[c]); if (!canon) continue;
  for (const name of g.names) { lines.push(`export const ${name}: LucideIcon = makeIcon(${JSON.stringify(canon)}, ${JSON.stringify(name)});`); n++; }
}
fs.writeFileSync('src/exports.generated.ts', `// 自动生成，勿手改。每个导出名与 lucide-react 同名，指向同一个手绘图标。\nimport type { LucideIcon } from "lucide-react";\nimport { makeIcon } from "./makeIcon.js";\n${lines.join('\n')}\n`);
const names = groups.flatMap(g => g.canon.find(c => icons[c]) ? g.names : []);
fs.writeFileSync('src/index.tsx', `// 月字图标集入口。先整体透传 lucide-react（动态图标名、createLucideIcon、类型等兜底），\n// 再用显式具名导出覆盖同名图标——显式导出优先于 \`export *\`，且 TypeScript 不会报重名歧义。\n// 自动生成，勿手改（node tools/gen.mjs）。\nexport * from "lucide-react";\nexport {\n${names.map(n => '  ' + n + ',').join('\n')}\n} from "./exports.generated.js";\nexport { makeIcon, DEFAULT_STROKE, TONE_OPACITY } from "./makeIcon.js";\nexport { LunarMoon, type LunarMoonProps } from "./moon/LunarMoon.js";\nexport { getMoonTextureDataUrl } from "./moon/texture.js";\n`);
console.log('icons', Object.keys(icons).length, 'exports', n);
