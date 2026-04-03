import { describe, expect, it } from 'vitest';
import { getLambdaSupportsStreaming } from '../src/process-serverless/get-lambda-supports-streaming';
import FileBlob from '../src/file-blob';

describe('getLambdaSupportsStreaming()', () => {
  it('returns undefined when streaming is not supported', async () => {
    const result = await getLambdaSupportsStreaming(
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
    );
    expect(result.supportsStreaming).toEqual(undefined);
    expect(result.error).toBeUndefined();
  });

  it('honors `supportsResponseStreaming` from the lambda', async () => {
    const result = await getLambdaSupportsStreaming(
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
    );
    expect(result.supportsStreaming).toEqual(false);
    expect(result.error).toBeUndefined();
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
    const result = await getLambdaSupportsStreaming(
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
    );
    expect(result.supportsStreaming).toEqual(true);
    expect(result.error).toBeUndefined();
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
    const result = await getLambdaSupportsStreaming(
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
    );
    expect(result.supportsStreaming).toEqual(true);
    expect(result.error).toBeUndefined();
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
    const result = await getLambdaSupportsStreaming(
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
    );
    expect(result.supportsStreaming).toEqual(true);
    expect(result.error).toBeUndefined();
  });

  it("should return `undefined` when lambda doesn't export an HTTP method", async () => {
    const result = await getLambdaSupportsStreaming(
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
    );
    expect(result.supportsStreaming).toEqual(undefined);
    expect(result.error).toBeUndefined();
  });

  it('honors the default setting for Python runtimes', async () => {
    const result = await getLambdaSupportsStreaming(
      {
        handler: 'handler.py',
        runtime: 'python3.8',
        supportsResponseStreaming: true,
      },
      false
    );
    expect(result.supportsStreaming).toEqual(true);
    expect(result.error).toBeUndefined();
  });

  it('returns true when forceStreamingRuntime is true', async () => {
    const result = await getLambdaSupportsStreaming(
      {
        handler: 'handler.py',
        runtime: 'python3.8',
      },
      true
    );
    expect(result.supportsStreaming).toEqual(true);
    expect(result.error).toBeUndefined();
  });

  it('returns error when handler cannot be parsed', async () => {
    const result = await getLambdaSupportsStreaming(
      {
        launcherType: 'Nodejs',
        handler: 'handler.mjs',
        runtime: 'nodejs20.x',
        files: {
          'handler.mjs': new FileBlob({
            data: `this is not valid javascript {{{`,
          }),
        },
      },
      false
    );
    expect(result.supportsStreaming).toEqual(undefined);
    expect(result.error).toBeDefined();
    expect(result.error?.handler).toEqual('handler.mjs');
    expect(result.error?.message).toBeTruthy();
  });
});
