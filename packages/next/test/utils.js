const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname } = require('node:path');
const { transformSync } = require('esbuild');

const filename = require.resolve('./utils.ts');
const { code } = transformSync(readFileSync(filename, 'utf8'), {
  format: 'cjs',
  loader: 'ts',
  target: 'node20',
});

const compiledModule = { exports: {} };
const evaluate = new Function(
  'module',
  'exports',
  'require',
  '__filename',
  '__dirname',
  code
);
evaluate(
  compiledModule,
  compiledModule.exports,
  createRequire(filename),
  filename,
  dirname(filename)
);
module.exports = compiledModule.exports;
