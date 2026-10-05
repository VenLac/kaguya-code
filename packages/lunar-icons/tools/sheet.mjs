// 生成预览图 HTML：node tools/sheet.mjs src/a.txt out.html
import fs from 'node:fs'; import {parse,svgOf} from './build.mjs';
const [,, src, out, cols='10'] = process.argv;
const icons=parse(fs.readFileSync(src,'utf8'));
const cells=Object.entries(icons).map(([n,ic])=>`<div class="c"><div class="big">${svgOf(ic,{size:72})}</div><div class="sm">${svgOf(ic,{size:16})}${svgOf(ic,{size:20})}</div><span>${n}</span></div>`).join('');
fs.writeFileSync(out,`<!doctype html><meta charset=utf-8><style>body{margin:0;background:#0e1422;color:#eef3fa;font:11px system-ui;padding:14px}.g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px}.c{background:#141c2e;border-radius:14px;padding:10px 6px 8px;text-align:center}.big{color:#a9d6ff}.sm{display:flex;gap:10px;justify-content:center;margin:4px 0;color:#eef3fa}span{color:#8f9bb3;font-size:10px}</style><div class=g>${cells}</div>`);
console.log(Object.keys(icons).length,'icons');
