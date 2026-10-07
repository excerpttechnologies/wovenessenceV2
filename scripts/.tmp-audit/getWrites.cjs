/* Lists GET handlers whose body contains a database write. */
const fs = require('fs');
const path = require('path');

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : e.name === 'route.js' ? [p] : [];
});
const WRITE = /\.(create|insertOne|insertMany|updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|findByIdAndDelete|deleteOne|deleteMany|bulkWrite|replaceOne|save)\s*\(|\$inc|nextNumber|nextSeq|allocate|reserve/;

function getBody(src) {
  const m = /export\s+(async\s+)?function\s+GET\s*\(|export\s+const\s+GET\s*=/.exec(src);
  if (!m) return null;
  let i = src.indexOf('{', src.indexOf(')', m.index));
  let depth = 0; const start = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

const files = walk('app/api');
let gets = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const body = getBody(src);
  if (!body) continue;
  gets++;
  const hits = body.split('\n').filter((l) => WRITE.test(l));
  if (hits.length) {
    console.log('WRITES IN GET: ' + f);
    hits.slice(0, 6).forEach((l) => console.log('     ' + l.trim().slice(0, 160)));
  }
}
console.log('GET handlers scanned: ' + gets + ' of ' + files.length + ' route files');
