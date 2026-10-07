const fs = require('fs');
const path = require('path');

const snap = 'scripts/.tmp-audit/snap';
const tgzTime = fs.statSync('backups/code-before-contact-split-2026-09-15T09-58-25Z.tgz').mtimeMs;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return (e.name === 'node_modules' || e.name === '.tmp-audit') ? [] : walk(p);
  return /\.(m?js|jsx)$/.test(e.name) ? [p] : [];
});
const files = ['app', 'lib', 'models', 'components', 'scripts'].flatMap(walk)
  .filter((f) => fs.statSync(f).mtimeMs > tgzTime);
const BS = String.fromCharCode(92);
const count = (s) => s.split(BS).length - 1;
const isComment = (l) => /^\s*(\*|\/\/|\/\*)/.test(l);

for (const f of files) {
  const cur = fs.readFileSync(f, 'utf8');
  const sp = path.join(snap, f);
  if (!fs.existsSync(sp)) {
    const sus = cur.split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => l.includes(BS) && !isComment(l));
    console.log('NEW  ' + f + '  code lines with a backslash: ' + sus.length);
    sus.slice(0, 15).forEach(([n, l]) => console.log('       ' + n + ': ' + l.trim().slice(0, 170)));
    continue;
  }
  const old = fs.readFileSync(sp, 'utf8');
  const curLines = new Set(cur.split(/\r?\n/));
  const lost = old.split(/\r?\n/).filter((l) => l.includes(BS) && !curLines.has(l));
  console.log((lost.length ? 'DIFF ' : 'ok   ') + f + '  backslashes ' + count(old) + ' -> ' + count(cur)
    + (lost.length ? '  snapshot lines with a backslash no longer present: ' + lost.length : ''));
  lost.slice(0, 8).forEach((l) => console.log('       - ' + l.trim().slice(0, 170)));
}
