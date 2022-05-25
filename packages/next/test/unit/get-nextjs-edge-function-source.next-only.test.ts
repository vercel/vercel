import { basename, join, dirname } from 'path';
import { getNextjsEdgeFunctionSource } from '../../dist/edge-function-source/get-edge-function-source';
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
        text: randomBytes(1200000).toString('base64'),
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
    /Exceeds maximum edge function script size: .+[MK]B \/ .+[M|K]B/i
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
        name: 'wasm_1234',
        filePath: 'server/middleware-chunks/wasm_1234.wasm',
      },
    ]
  );
  const source = edgeFunctionSource.source();
  expect(source).toMatch(/nextConfig/);
  expect(source).toContain(`const wasm_1234 = require("/wasm/wasm_1234.wasm")`);
});
