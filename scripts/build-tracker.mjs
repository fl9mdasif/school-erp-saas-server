// Generates ../development-tracker.html from CHECKLIST.md. Usage: npm run tracker
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(join(root, 'CHECKLIST.md'), 'utf8');

const phases = [];
for (const line of md.split(/\r?\n/)) {
  const p = line.match(/^## (Phase \d+): (.+)$/);
  if (p) {
    phases.push({ id: p[1], title: p[2], steps: [] });
    continue;
  }
  const s = line.match(/^- \[( |x)\] (\d+\.\d+) (.+)$/);
  if (s && phases.length) phases[phases.length - 1].steps.push({ done: s[1] === 'x', id: s[2], text: s[3] });
}

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const all = phases.flatMap((p) => p.steps);
const doneAll = all.filter((s) => s.done).length;
const pct = (d, t) => (t ? Math.round((d / t) * 100) : 0);
const current = all.find((s) => !s.done);

const sections = phases
  .map((p) => {
    const d = p.steps.filter((s) => s.done).length;
    const items = p.steps
      .map((s) => {
        const cls = s.done ? 'done' : s === current ? 'now' : '';
        const mark = s.done ? '&#10003;' : s === current ? '&#9654;' : '';
        return `<li class="${cls}"><span class="box">${mark}</span><b>${s.id}</b> ${esc(s.text)}</li>`;
      })
      .join('');
    return `<section><h2>${esc(p.id)}: ${esc(p.title)} <small>${d}/${p.steps.length}</small></h2>
<div class="bar"><i style="width:${pct(d, p.steps.length)}%"></i></div><ul>${items}</ul></section>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>School Server Tracker</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#1b1f24;--mute:#6b7280;--line:#e5e7eb;--acc:#2563eb;--ok:#16a34a}
@media(prefers-color-scheme:dark){:root{--bg:#0f1216;--card:#171b21;--text:#e8eaed;--mute:#9aa3ad;--line:#262c35;--acc:#60a5fa;--ok:#4ade80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif;padding:24px 16px}
main{max-width:760px;margin:0 auto}h1{margin:0 0 4px;font-size:22px}p.sub{margin:0 0 20px;color:var(--mute)}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:14px}
h2{margin:0 0 10px;font-size:16px}h2 small{color:var(--mute);font-weight:400;margin-left:6px}
.bar{height:8px;background:var(--line);border-radius:4px;overflow:hidden;margin-bottom:12px}.bar i{display:block;height:100%;background:var(--ok)}
.total .bar{height:12px}ul{list-style:none;margin:0;padding:0}li{display:flex;gap:10px;align-items:baseline;padding:5px 0;color:var(--mute)}
li b{color:var(--mute);font-weight:600;min-width:2.4em}li.done{color:var(--text)}li.done b{color:var(--ok)}li.now{color:var(--text);font-weight:600}li.now b{color:var(--acc)}
.box{width:18px;height:18px;border:1.5px solid var(--line);border-radius:4px;display:inline-grid;place-items:center;font-size:11px;flex:none;transform:translateY(3px)}
li.done .box{background:var(--ok);border-color:var(--ok);color:#fff}li.now .box{border-color:var(--acc);color:var(--acc)}
</style></head><body><main>
<h1>School Management Server: Progress</h1>
<p class="sub">${doneAll} of ${all.length} steps done (${pct(doneAll, all.length)}%)${current ? ` &middot; next: <b>${current.id}</b> ${esc(current.text)}` : ' &middot; all done'}</p>
<section class="total"><div class="bar"><i style="width:${pct(doneAll, all.length)}%"></i></div></section>
${sections}
</main></body></html>`;

writeFileSync(join(root, '..', 'development-tracker.html'), html);
console.log(`tracker updated: ${doneAll}/${all.length}`);
