import type { NextjsParams } from './get-edge-function';
import { readFile } from 'fs-extra';
import { ConcatSource, Source } from 'webpack-sources';
import { fileToSource, raw, sourcemapped } from '../sourcemapped';
import { join } from 'path';
import { EDGE_FUNCTION_SIZE_LIMIT } from '../constants';
import zlib from 'zlib';
import { promisify } from 'util';
import { prettyBytes } from '../pretty-bytes';

// @ts-ignore this is a prebuilt file, based on `../../scripts/build-edge-function-template.js`
import template from '../../dist/___get-nextjs-edge-function.js';

const gzip = promisify<zlib.InputType, Buffer>(zlib.gzip);

/**
 * Allows to get the source code for a Next.js Edge Function where the output
 * is defined by a set of filePaths that compose all chunks. Those will write
 * to a global namespace _ENTRIES. The Next.js parameters will allow to adapt
 * the function into the core Edge Function signature.
 *
 * @param filePaths Array of relative file paths for the function chunks.
 * @param params Next.js parameters to adapt it to core edge functions.
 * @param outputDir The output directory the files in `filePaths` stored in.
 * @returns The source code of the edge function.
 */
export async function getNextjsEdgeFunctionSource(
  filePaths: string[],
  params: NextjsParams,
  outputDir: string,
  wasm?: { filePath: string; name: string }[]
): Promise<Source> {
  const chunks = new ConcatSource(raw(`let _ENTRIES = {};`));
  for (const filePath of filePaths) {
    const fullFilePath = join(outputDir, filePath);
    const content = await readFile(fullFilePath, 'utf8');
    chunks.add(raw(`\n/**/;`));
    chunks.add(await fileToSource(content, filePath, fullFilePath));
  }

  const text = chunks.source();

  /**
   * We validate at this point because we want to verify against user code.
   * It should not count the Worker wrapper nor the Next.js wrapper.
   */
  const wasmFiles = (wasm ?? []).map(({ filePath }) =>
    join(outputDir, filePath)
  );
  await validateSize(text, wasmFiles);

  // Wrap to fake module.exports
  const getPageMatchCode = `(function () {
    const module = { exports: {}, loaded: false };
    const fn = (function(module,exports) {${template}\n});
    fn(module, module.exports);
    return module.exports;
  })`;

  return sourcemapped`
  ${raw(getWasmImportStatements(wasm))}
  ${chunks};
  export default ${raw(getPageMatchCode)}.call({}).default(
    ${raw(JSON.stringify(params))}
  )`;
}

function getWasmImportStatements(wasm: { name: string }[] = []) {
  return wasm
    .filter(({ name }) => name.startsWith('wasm_'))
    .map(({ name }) => {
      const pathname = `/wasm/${name}.wasm`;
      return `const ${name} = require(${JSON.stringify(pathname)});`;
    })
    .join('\n');
}

async function validateSize(script: string, wasmFiles: string[]) {
  const buffers = [Buffer.from(script, 'utf8')];
  for (const filePath of wasmFiles) {
    buffers.push(await readFile(filePath));
  }
  const content = Buffer.concat(buffers);

  const gzipped = await gzip(content);
  if (gzipped.length > EDGE_FUNCTION_SIZE_LIMIT) {
    throw new Error(
      `Exceeds maximum edge function size: ${prettyBytes(
        gzipped.length
      )} / ${prettyBytes(EDGE_FUNCTION_SIZE_LIMIT)}`
    );
  }
}
