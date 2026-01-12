import { readFile, writeFile, readdir, unlink, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import doT from 'dot';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export async function compileDevTemplates() {
  const dirRoot = new URL('../', import.meta.url);

  // Compile the `doT.js` template files for `vercel dev`
  const templatesDirURL = new URL('src/util/dev/templates/', dirRoot);
  doT.process({ path: fileURLToPath(templatesDirURL) });

  const files = await readdir(templatesDirURL);
  const compiledFiles = files.filter(f => f.endsWith('.js'));

  for (const file of compiledFiles) {
    const fnPath = new URL(file, templatesDirURL);
    const cjsPath = new URL(file.replace(/\.js$/, '.cjs'), templatesDirURL);
    const tsPath = fnPath.href.replace(/\.js$/, '.ts');
    const def = await readFile(
      new URL(fnPath.href.replace(/\.js$/, '.tsdef')),
      'utf8'
    );
    const interfaceName = def.match(/interface (\w+)/)[1];

    // doT generates CommonJS code, but since this is an ESM package (.js files
    // are treated as ESM), we rename to .cjs so require() can load it properly.
    // After extracting the function, we delete the temp .cjs file since we're
    // generating a TypeScript version instead.
    await rename(fnPath, cjsPath);
    const fn = require(fileURLToPath(cjsPath));
    await unlink(cjsPath);

    const contents = `import encodeHTML from 'escape-html';

${def}
export default ${fn
      .toString()
      .replace(/var encodeHTML.+\(\)\);/s, '')
      .replace(/\bvar\b/g, 'let')
      .replace(/\(it\s*\)/s, `(it: ${interfaceName}): string`)}`;

    await writeFile(new URL(tsPath), contents);
  }
}
