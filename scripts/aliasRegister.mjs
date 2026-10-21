/* Installs the "@/" resolver above. Kept separate because module.register()
   must run before the module graph being tested is loaded. */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./aliasHooks.mjs', pathToFileURL('./scripts/'));
