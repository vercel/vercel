import { createEdgeWasmPlugin } from '../../../src/edge-functions/edge-wasm-plugin';
import { prepareFilesystem } from '../test-utils';
import { build } from 'esbuild';
import { join } from 'path';

test('fails to locate the file', async () => {
  const { workPath: dir } = await prepareFilesystem({
    'index.js': `
      import wasm from './file.wasm?module';
      console.log(wasm);
    `,
  });
  await expect(buildWithPlugin(dir)).rejects.toThrowError(
    `WebAssembly file could not be located: ./file.wasm`
  );
});

test('locates the file', async () => {
  const { workPath: dir } = await prepareFilesystem({
    'index.js': `
      import wasm from './file.wasm?module';
      console.log(wasm);
    `,
    'file.wasm': Buffer.from('binary file'),
  });
  const { assets, code } = await buildWithPlugin(dir);
  expect([...assets]).toHaveLength(1);
  expect(code).toContain('globalThis["wasm_');
});

async function buildWithPlugin(
  directory: string
): Promise<{ assets: Map<string, string>; code: string }> {
  const { plugin, wasmAssets } = createEdgeWasmPlugin();
  const {
    outputFiles: [file],
  } = await build({
    bundle: true,
    logLevel: 'silent',
    format: 'cjs',
    write: false,
    plugins: [plugin],
    entryPoints: [join(directory, 'index.js')],
  });
  return { assets: wasmAssets, code: file.text };
}
