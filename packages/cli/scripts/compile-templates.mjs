import execa from 'execa';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';

export async function compileDevTemplates() {
  const dirRoot = new URL('../', import.meta.url);

  // Compile the `doT.js` template files for `vercel dev`
  const templatesDir = new URL('src/util/dev/templates/', dirRoot);
  const dotPacker = fileURLToPath(new URL('../../node_modules/dot/bin/dot-packer', dirRoot));
  await execa(process.execPath, [dotPacker], {
    cwd: templatesDir,
    stdio: ['ignore', 'ignore', 'inherit']
  });

  const files = await readdir(templatesDir);
  const compiledFiles = files.filter(f => f.endsWith('.js'));

  for (const file of compiledFiles) {
    const fnPath = new URL(file, templatesDir);
    const tsPath = fnPath.href.replace(/\.js$/, '.ts');
    const def = await readFile(new URL(fnPath.href.replace(/\.js$/, '.tsdef')), 'utf8');
    const interfaceName = def.match(/interface (\w+)/)[1];

    const { default: fn } = await import(fnPath);
    const lines = fn.toString().split('\n');
    let errorHtmlStart = -1;
    let errorHtmlEnd = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (errorHtmlStart === -1 && line.includes('encodeHTML')) {
        errorHtmlStart = i;
      } else if (errorHtmlEnd === -1 && line.includes(')();')) {
        errorHtmlEnd = i;
      }
      if (/\bvar\b/.test(line)) {
        lines[i] = line.replace(/\bvar\b/g, 'let');
      }
    }
    lines.splice(errorHtmlStart, errorHtmlEnd);

    lines[0] = `export default ${lines[0].replace(
      '(it)',
      `(it: ${interfaceName}): string`
    )}`;

    lines.unshift(
      "import encodeHTML from 'escape-html';",
      '',
      ...def.split('\n')
    );

    await Promise.all([writeFile(new URL(tsPath), lines.join('\n')), unlink(fnPath)]);
  }
}
