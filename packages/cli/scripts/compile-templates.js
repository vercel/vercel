const execa = require('execa');
const { join } = require('path');
const { readFile, writeFile, readdir, remove } = require('fs-extra');

async function main() {
  const dirRoot = join(__dirname, '..');

  // Compile the `doT.js` template files for `vercel dev`
  const templatesDir = join(dirRoot, 'src/util/dev/templates');
  const dotPacker = join(dirRoot, '../../node_modules/dot/bin/dot-packer');
  await execa(process.execPath, [dotPacker], {
    cwd: templatesDir,
    stdio: 'inherit',
  });

  const files = await readdir(templatesDir);
  const compiledFiles = files.filter(f => f.endsWith('.js'));

  // Prettier
  console.log('\nMaking the compiled template functions prettier...');
  const prettier = join(dirRoot, '../../node_modules/prettier/bin-prettier.js');
  await execa(
    process.execPath,
    [prettier, '--write', '--single-quote', ...compiledFiles],
    {
      cwd: templatesDir,
      stdio: 'inherit',
    }
  );

  console.log('\nConverting template functions to TypeScript');
  for (const file of compiledFiles) {
    const start = Date.now();
    const fnPath = join(templatesDir, file);
    const tsPath = fnPath.replace(/\.js$/, '.ts');
    const def = await readFile(fnPath.replace(/\.js$/, '.tsdef'), 'utf8');
    const interfaceName = def.match(/interface (\w+)/)[1];

    const lines = require(fnPath)
      .toString()
      .split('\n');
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

    await Promise.all([writeFile(tsPath, lines.join('\n')), remove(fnPath)]);
    console.log(
      `${file} -> ${file.replace(/\.js$/, '.ts')} (${Date.now() - start}ms)`
    );
  }
}

process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:');
  console.error(err);
  process.exit(1);
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:');
  console.error(err);
  process.exit(1);
});

main().catch(err => {
  console.error(err);
  process.exit(1);
});
