import { appendFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tsc, esbuild } from '../../utils/build.mjs';
import { lazyEntryPlugin } from './lazy-entry.mjs';

await rm(new URL('./dist', import.meta.url), { recursive: true, force: true });
await Promise.all([
  tsc(),
  esbuild().then(() =>
    esbuild({
      bundle: true,
      minifySyntax: true,
      minifyWhitespace: true,
      plugins: [lazyEntryPlugin()],
    })
  ),
]);

// Node's CommonJS lexer needs literal export names to support ESM named
// imports. Enumerating the barrel does not invoke its lazy property getters.
const require = createRequire(import.meta.url);
const names = Object.keys(require('./dist/index.js'));
await appendFile(
  new URL('./dist/index.js', import.meta.url),
  `\n// Named exports for Node's CommonJS lexer.\n0 && (module.exports = {${names.map(name => `${JSON.stringify(name)}: null`).join(',')}});\n`
);
