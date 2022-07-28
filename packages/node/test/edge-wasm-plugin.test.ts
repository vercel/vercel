import { createEdgeWasmPlugin } from '../src/edge-wasm-plugin';
import { build } from 'esbuild';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

test('fails to locate the file', async () => {
  const dir = await prepareFilesystem({
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
  const dir = await prepareFilesystem({
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

type Fs = Record<string, Buffer | string | { copy: string }>;
async function prepareFilesystem(files: Fs): Promise<string> {
  const newDirectory = join(tmpdir(), `edge-wasm-plugin-${Date.now()}`);
  await fs.mkdir(newDirectory, { recursive: true });
  for (const [key, value] of Object.entries(files)) {
    const fullPath = join(newDirectory, key);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    if (typeof value === 'string' || value instanceof Buffer) {
      await fs.writeFile(join(newDirectory, key), value);
    } else if (typeof value.copy === 'string') {
      await fs.copyFile(
        join(newDirectory, value.copy),
        join(newDirectory, key)
      );
    }
  }
  return newDirectory;
}
