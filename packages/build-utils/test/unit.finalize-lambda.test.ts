import { describe, expect, it } from 'vitest';
import { finalizeLambda } from '../src/finalize-lambda';
import type { TraceFn } from '../src/finalize-lambda';
import { NodejsLambda } from '../src/nodejs-lambda';
import { Lambda } from '../src/lambda';
import FileBlob from '../src/file-blob';
import type { BytecodeCachingOptions } from '../src/process-serverless/get-lambda-preload-scripts';
import { sha256 } from '../src/fs/stream-to-digest-async';

const NO_BYTECODE: BytecodeCachingOptions = {
  vercelEnv: undefined,
  useBytecodeCaching: undefined,
  useNativeBytecodeCaching: undefined,
  bytecodeCachingThreshold: undefined,
};

function createBasicLambda(files?: Record<string, FileBlob>) {
  return new Lambda({
    files: files ?? {
      'index.js': new FileBlob({ data: 'exports.handler = () => {};' }),
    },
    handler: 'index.handler',
    runtime: 'nodejs20.x',
  });
}

function createNodejsLambda(files?: Record<string, FileBlob>) {
  return new NodejsLambda({
    files: files ?? {
      'index.js': new FileBlob({ data: 'exports.handler = () => {};' }),
    },
    handler: 'index.js',
    runtime: 'nodejs20.x',
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: false,
  });
}

describe('finalizeLambda()', () => {
  it('returns buffer, digest, and uncompressedBytes', async () => {
    const lambda = createBasicLambda();
    const result = await finalizeLambda({
      lambda,
      bytecodeCachingOptions: NO_BYTECODE,
      forceStreamingRuntime: false,
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.zipPath).toBeNull();
    expect(result.digest).toEqual(sha256(result.buffer));
    expect(result.uncompressedBytes).toEqual(0);
  });

  it('computes correct SHA-256 digest of ZIP buffer', async () => {
    const lambda = createBasicLambda();
    const result = await finalizeLambda({
      lambda,
      bytecodeCachingOptions: NO_BYTECODE,
      forceStreamingRuntime: false,
    });

    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.digest).toEqual(sha256(result.buffer));
  });

  it('injects encrypted env file into lambda.files when provided', async () => {
    const lambda = createBasicLambda();
    const originalFiles = { ...lambda.files };

    await finalizeLambda({
      lambda,
      encryptedEnvFilename: '.env.encrypted',
      encryptedEnvContent: Buffer.from('SECRET=value').toString('base64'),
      bytecodeCachingOptions: NO_BYTECODE,
      forceStreamingRuntime: false,
    });

    expect(lambda.files).toHaveProperty('.env.encrypted');
    expect(Object.keys(lambda.files!).length).toBeGreaterThan(
      Object.keys(originalFiles!).length
    );
    expect(lambda.zipBuffer).toBeUndefined();
  });

  it('skips encrypted env when params are undefined', async () => {
    const lambda = createBasicLambda();
    const filesBefore = { ...lambda.files };

    await finalizeLambda({
      lambda,
      bytecodeCachingOptions: NO_BYTECODE,
      forceStreamingRuntime: false,
    });

    expect(Object.keys(lambda.files!)).toEqual(Object.keys(filesBefore));
  });

  it('sets lambda.environment via getLambdaEnvironment', async () => {
    const lambda = createNodejsLambda();
    lambda.shouldAddHelpers = true;

    await finalizeLambda({
      lambda,
      bytecodeCachingOptions: NO_BYTECODE,
      forceStreamingRuntime: false,
    });

    expect(lambda.environment.VERCEL_SHOULD_ADD_HELPERS).toEqual('1');
  });

  it('detects streaming support and sets lambda.supportsResponseStreaming when forced', async () => {
    const lambda = createBasicLambda();

    await finalizeLambda({
      lambda,
      bytecodeCachingOptions: NO_BYTECODE,
      forceStreamingRuntime: true,
    });

    expect(lambda.supportsResponseStreaming).toEqual(true);
  });

  it('enables streaming for Nodejs lambdas regardless of handler', async () => {
    const lambda = new Lambda({
      files: {
        'index.js': new FileBlob({ data: 'exports.handler = () => {};' }),
      },
      handler: 'missing-handler.js',
      runtime: 'nodejs20.x',
    });
    (lambda as any).launcherType = 'Nodejs';

    const result = await finalizeLambda({
      lambda,
      bytecodeCachingOptions: NO_BYTECODE,
      forceStreamingRuntime: false,
    });

    expect(result.streamingError).toBeUndefined();
    expect(lambda.supportsResponseStreaming).toEqual(true);
  });

  it('collects uncompressed size when flag is enabled', async () => {
    const data = Buffer.alloc(1024);
    const lambda = createBasicLambda({
      'index.js': new FileBlob({ data }),
    });

    const result = await finalizeLambda({
      lambda,
      bytecodeCachingOptions: NO_BYTECODE,
      forceStreamingRuntime: false,
      enableUncompressedLambdaSizeCheck: true,
    });

    expect(result.uncompressedBytes).toEqual(1024);
  });

  it('skips uncompressed size when flag is disabled', async () => {
    const data = Buffer.alloc(1024);
    const lambda = createBasicLambda({
      'index.js': new FileBlob({ data }),
    });

    const result = await finalizeLambda({
      lambda,
      bytecodeCachingOptions: NO_BYTECODE,
      forceStreamingRuntime: false,
    });

    expect(result.uncompressedBytes).toEqual(0);
  });

  it('calls trace function for collectUncompressedSize and createZip', async () => {
    const traced: string[] = [];
    const trace: TraceFn = async (name, fn) => {
      traced.push(name);
      return fn();
    };

    const lambda = createBasicLambda({
      'index.js': new FileBlob({ data: Buffer.alloc(100) }),
    });

    await finalizeLambda({
      lambda,
      bytecodeCachingOptions: NO_BYTECODE,
      forceStreamingRuntime: false,
      enableUncompressedLambdaSizeCheck: true,
      trace,
    });

    expect(traced).toContain('collectUncompressedSize');
    expect(traced).toContain('createZip');
  });

  it('does not call trace when not provided', async () => {
    const lambda = createBasicLambda();

    // Should not throw — default no-op trace is used
    const result = await finalizeLambda({
      lambda,
      bytecodeCachingOptions: NO_BYTECODE,
      forceStreamingRuntime: false,
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it('returns a zipPath for custom createZip strategies', async () => {
    const lambda = createBasicLambda();
    const result = await finalizeLambda({
      lambda,
      bytecodeCachingOptions: NO_BYTECODE,
      forceStreamingRuntime: false,
      createZip: async () => ({
        buffer: null,
        zipPath: '/tmp/lambda.zip',
        digest: 'abc123',
        size: 123,
      }),
    });

    expect(result.buffer).toBeNull();
    expect(result.zipPath).toEqual('/tmp/lambda.zip');
    expect(result.digest).toEqual('abc123');
    expect(result.size).toEqual(123);
  });
});
