const { build } = require('esbuild');
const assert = require('assert');
const { outputFile } = require('fs-extra');

/**
 * @param {Pick<import('esbuild').BuildOptions, 'outfile' | 'format' | 'entryPoints' | 'write'>} options
 */
async function buildTemplate(options) {
  return build({
    bundle: true,
    entryPoints: options.entryPoints,
    format: options.format,
    legalComments: 'none',
    minify: process.env.NODE_ENV !== 'test',
    outfile: options.outfile,
    // Cloudflare Workers uses the V8 JavaScript engine from Google Chrome.
    // The Workers runtime is updated at least once a week, to at least the version
    // that is currently used by Chrome's stable release.
    // To see the latest stable chrome version: https://www.chromestatus.com/features/schedule
    target: 'esnext',
    write: options.write,
  });
}

async function buildNextjsWrapper() {
  const { outputFiles } = await buildTemplate({
    entryPoints: ['./src/edge-function-source/get-edge-function'],
    outfile: 'dist/___get-nextjs-edge-function.js',
    format: 'cjs', // https://esbuild.github.io/api/#format
    write: false,
  });

  assert(outputFiles);
  const [src] = outputFiles;

  return outputFile(src.path, `module.exports = ${JSON.stringify(src.text)}`);
}

module.exports = buildNextjsWrapper;
