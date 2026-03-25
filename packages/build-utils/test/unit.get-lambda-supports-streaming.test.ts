import { describe, expect, it } from 'vitest';
import { getLambdaSupportsStreaming } from '../src/process-serverless/get-lambda-supports-streaming';
import FileBlob from '../src/file-blob';

describe('getLambdaSupportsStreaming()', () => {
  it('returns undefined when streaming is not supported', async () => {
    expect(
      await getLambdaSupportsStreaming(
        {
          launcherType: 'Nodejs',
          handler: 'handler.js',
          runtime: 'nodejs20.x',
          files: {
            'handler.js': new FileBlob({
              data: `module.exports.handler = () => {};`,
            }),
          },
        },
        false
      )
    ).toEqual(undefined);
  });

  it('honors `supportsResponseStreaming` from the lambda', async () => {
    expect(
      await getLambdaSupportsStreaming(
        {
          supportsResponseStreaming: false,
          launcherType: 'Nodejs',
          handler: 'handler.js',
          runtime: 'nodejs20.x',
          files: {
            'handler.js': new FileBlob({
              data: `module.exports.handler = () => {};`,
            }),
          },
        },
        false
      )
    ).toEqual(false);
  });

  it.each([
    { method: 'GET' },
    { method: 'HEAD' },
    { method: 'OPTIONS' },
    { method: 'POST' },
    { method: 'PUT' },
    { method: 'DELETE' },
    { method: 'PATCH' },
  ])('should return `true` when lambda exports %s in CJS', async ({
    method,
  }) => {
    expect(
      await getLambdaSupportsStreaming(
        {
          launcherType: 'Nodejs',
          handler: 'handler.js',
          runtime: 'nodejs20.x',
          files: {
            'handler.js': new FileBlob({
              data: `module.exports.${method} = () => {};`,
            }),
          },
        },
        false
      )
    ).toEqual(true);
  });

  it.each([
    { method: 'GET' },
    { method: 'HEAD' },
    { method: 'OPTIONS' },
    { method: 'POST' },
    { method: 'PUT' },
    { method: 'DELETE' },
    { method: 'PATCH' },
  ])('should return `true` when lambda exports %s handler method in ESM', async ({
    method,
  }) => {
    expect(
      await getLambdaSupportsStreaming(
        {
          launcherType: 'Nodejs',
          handler: 'handler.mjs',
          runtime: 'nodejs20.x',
          files: {
            'handler.mjs': new FileBlob({
              data: `export const ${method} = () => {};`,
            }),
          },
        },
        false
      )
    ).toEqual(true);
  });

  it.each([
    { method: 'GET' },
    { method: 'HEAD' },
    { method: 'OPTIONS' },
    { method: 'POST' },
    { method: 'PUT' },
    { method: 'DELETE' },
    { method: 'PATCH' },
  ])('should return `true` when lambda exports %s handler in ESM but with a .js extension', async ({
    method,
  }) => {
    expect(
      await getLambdaSupportsStreaming(
        {
          launcherType: 'Nodejs',
          handler: 'handler.js',
          runtime: 'nodejs20.x',
          files: {
            'handler.js': new FileBlob({
              data: `export const ${method} = () => {};`,
            }),
          },
        },
        false
      )
    ).toEqual(true);
  });

  it("should return `undefined` when lambda doesn't export an HTTP method", async () => {
    expect(
      await getLambdaSupportsStreaming(
        {
          launcherType: 'Nodejs',
          handler: 'handler.js',
          runtime: 'nodejs20.x',
          files: {
            'handler.js': new FileBlob({
              data: `module.exports.handler = () => {};`,
            }),
          },
        },
        false
      )
    ).toEqual(undefined);
  });

  it('honors the default setting for Python runtimes', async () => {
    expect(
      await getLambdaSupportsStreaming(
        {
          handler: 'handler.py',
          runtime: 'python3.8',
          supportsResponseStreaming: true,
        },
        false
      )
    ).toEqual(true);
  });

  it('returns true when forceStreamingRuntime is true', async () => {
    expect(
      await getLambdaSupportsStreaming(
        {
          handler: 'handler.py',
          runtime: 'python3.8',
        },
        true
      )
    ).toEqual(true);
  });
});
