import { basename, join, dirname } from 'path';
import { getNextjsEdgeFunctionSource } from '../../src/edge-function-source/get-edge-function-source';
import { nanoid } from 'nanoid';
import { tmpdir } from 'os';
import { writeFile } from 'fs-extra';
import { randomBytes } from 'crypto';

it('should throw an error when exceeds the script size limit', async () => {
  const filepath = `${join(tmpdir(), nanoid())}.js`;
  const file = basename(filepath);
  const dir = dirname(filepath);
  await writeFile(
    filepath,
    `
    module.exports.middleware = function () {
      return Response(${JSON.stringify({
        text: randomBytes(4200 * 1024).toString('base64'),
      })})
    }
  `
  );

  await expect(async () => {
    await getNextjsEdgeFunctionSource(
      [file],
      {
        name: 'big-middleware',
        staticRoutes: [],
        nextConfig: null,
      },
      dir
    );
  }).rejects.toThrow(
    /Exceeds maximum edge function size: .+[MK]B \/ .+[M|K]B/i
  );
});

it('throws an error if it contains too big WASM file', async () => {
  const filepath = `${join(tmpdir(), nanoid())}.js`;
  const file = basename(filepath);
  const dir = dirname(filepath);
  await writeFile(
    filepath,
    `
      import wasm from './big.wasm?module';
      module.exports.middleware = function () {
        console.log(wasm)
        return Response('hi')
      }
    `
  );

  const wasmPath = join(dir, 'big.wasm');
  await writeFile(wasmPath, randomBytes(4200 * 1024));

  expect(async () => {
    await getNextjsEdgeFunctionSource(
      [file],
      {
        name: 'middleware',
        staticRoutes: [],
        nextConfig: null,
      },
      dir,
      [
        {
          name: 'wasm_big',
          filePath: 'big.wasm',
        },
      ]
    );
  }).rejects.toThrow(
    /Exceeds maximum edge function size: .+[MK]B \/ .+[M|K]B/i
  );
});

it('uses the template', async () => {
  const filepath = `${join(tmpdir(), nanoid())}.js`;
  const file = basename(filepath);
  const dir = dirname(filepath);
  await writeFile(
    filepath,
    `
      module.exports.middleware = function () {
        return Response("hi")
      }
    `
  );

  const wasmPath = join(dir, 'small.wasm');
  await writeFile(wasmPath, randomBytes(8));

  const edgeFunctionSource = await getNextjsEdgeFunctionSource(
    [file],
    {
      name: 'middleware',
      staticRoutes: [],
      nextConfig: null,
    },
    dir,
    [
      {
        name: 'wasm_small',
        filePath: 'small.wasm',
      },
    ]
  );
  const source = edgeFunctionSource.source();
  expect(source).toMatch(/nextConfig/);
  expect(source).toContain(
    `const wasm_small = require("/wasm/wasm_small.wasm")`
  );
});
