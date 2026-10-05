// 把 DSL 编译成 SVG 子元素字符串
import fs from 'node:fs';
export function parse(txt){
  const icons={};
  for(const raw of txt.split('\n')){
    const line=raw.trim(); if(!line||line.startsWith('#')) continue;
    const i=line.indexOf(':'); const name=line.slice(0,i).trim(); const rest=line.slice(i+1);
    const layers=rest.split(';').map(s=>s.trim()).filter(Boolean);
    let tone='',main='';
    const esc=s=>s.replace(/\s+/g,' ').trim();
    for(const L of layers){
      const t=L.split(/\s+/,1)[0]; const a=esc(L.slice(t.length));
      const n=a.split(' ').map(Number);
      const mir=(x)=>`<g transform="matrix(-1 0 0 1 24 0)">${x}</g>`;
      switch(t){
        case 'P': main+=`<path d="${a}"/>`; break;
        case 'Pm': main+=`<path d="${a}"/>`+mir(`<path d="${a}"/>`); break;
        case 'T': tone+=`<path d="${a}"/>`; break;
        case 'F': tone+=`<path d="${a}"/>`; main+=`<path d="${a}"/>`; break;
        case 'Fm': tone+=`<path d="${a}"/>`+mir(`<path d="${a}"/>`); main+=`<path d="${a}"/>`+mir(`<path d="${a}"/>`); break;
        case 'c': main+=`<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]}"/>`; break;
        case 'k': tone+=`<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]}"/>`; main+=`<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]}"/>`; break;
        case 'D': main+=`<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]}" stroke-dasharray="${(2*Math.PI*n[2]/14).toFixed(2)} ${(2*Math.PI*n[2]/14).toFixed(2)}" stroke-dashoffset="0"/>`; break;
        case 'G': { const [cx,cy,ro,ri,N]=n; let d=''; const step=2*Math.PI/N; const pt=(r,a)=>[(cx+r*Math.cos(a)).toFixed(2),(cy+r*Math.sin(a)).toFixed(2)];
          for(let i=0;i<N;i++){ const a=i*step-Math.PI/2; const q=[pt(ri,a-step*.34),pt(ro,a-step*.17),pt(ro,a+step*.17),pt(ri,a+step*.34)]; d+=(i?'L':'M')+q.map(p=>p.join(' ')).join('L'); } d+='z';
          tone+=`<path d="${d}"/>`; main+=`<path d="${d}"/>`; break; }
        case 'C': main+=`<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]??1.15}" fill="currentColor" stroke="none"/>`; break;
        case 'r': main+=`<rect x="${n[0]}" y="${n[1]}" width="${n[2]}" height="${n[3]}" rx="${n[4]??0}"/>`; break;
        case 'u': tone+=`<rect x="${n[0]}" y="${n[1]}" width="${n[2]}" height="${n[3]}" rx="${n[4]??0}"/>`; main+=`<rect x="${n[0]}" y="${n[1]}" width="${n[2]}" height="${n[3]}" rx="${n[4]??0}"/>`; break;
        default: throw new Error(`未知图层 ${t} in ${name}`);
      }
    }
    icons[name]={tone,main};
  }
  return icons;
}
export function svgOf(ic,{size=96,sw=1.7,tone=.16}={}){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><g fill="currentColor" fill-opacity="${tone}" stroke="none">${ic.tone}</g>${ic.main}</svg>`;
}
