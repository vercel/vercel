import { build } from 'esbuild';
import assert from 'node:assert';
import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';

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
    outfile: 'dist/___get-nextjs-edge-function.cjs',
    format: 'esm', // https://esbuild.github.io/api/#format
    write: false,
  });

  assert(outputFiles);
  const [src] = outputFiles;

  return fs.outputFile(
    src.path,
    `module.exports = ${JSON.stringify(src.text)}`
  );
}

export default buildNextjsWrapper;

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  buildNextjsWrapper().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
