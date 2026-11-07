import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const pages = walk(path.join(root, 'app', 'admin')).filter((p) => /\.(jsx|js)$/.test(p));
const routes = walk(path.join(root, 'app', 'api')).filter((p) => p.endsWith('route.js'));
const routeText = new Map(routes.map((r) => [r, fs.readFileSync(r, 'utf8')]));

for (const page of pages) {
  const txt = fs.readFileSync(page, 'utf8');
  const refKeys = [...txt.matchAll(/k:\s*["']([A-Za-z0-9_]+)["'],\s*t:\s*["'][^"']*["'],\s*f:\s*["']ref["']/g)].map((m) => m[1]);
  if (!refKeys.length) continue;
  const ep = (txt.match(/endpoint:\s*["']([^"']+)["']/) || [])[1] || '(none)';
  const route = path.join(root, 'app', ...ep.replace(/^\//, '').split('/'), 'route.js');
  const rel = path.relative(root, page).replaceAll('\\', '/');
  if (!fs.existsSync(route)) {
    console.log(`PAGE ${rel}\n  endpoint ${ep} -> MISSING ROUTE\n  refs ${[...new Set(refKeys)].join(', ')}`);
    continue;
  }
  const rt = routeText.get(route);
  const hasLabels = /resolveRefLabels/.test(rt);
  console.log(`PAGE ${rel}\n  endpoint ${ep} -> ${hasLabels ? 'labels OK' : 'NO resolveRefLabels'}\n  refs ${[...new Set(refKeys)].join(', ')}`);
}
