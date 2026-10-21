/* Resolves the project's "@/..." import alias for plain Node.

   lib/ and models/ are written for Next, which maps "@/x" to "<root>/x" via
   jsconfig.json. Node knows nothing about that, so a test that imports
   lib/docnumber.js directly fails on its first "@/models/..." import - which
   is why the numbering tests were silently skipping.

   Registered with:  node --import ./scripts/aliasRegister.mjs <script>
   so the real modules are exercised rather than a copy of their logic. */

import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = process.cwd();

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const target = path.join(ROOT, specifier.slice(2));
    /* the alias is written without an extension in some places */
    for (const candidate of [target, target + '.js', target + '.mjs', path.join(target, 'index.js')]) {
      try {
        return await next(pathToFileURL(candidate).href, context);
      } catch { /* try the next candidate */ }
    }
  }
  return next(specifier, context);
}
