import { describe, expect, it } from 'vitest';
import { NodejsLambda } from '../src/nodejs-lambda';
import { getLambdaEnvironment } from '../src/process-serverless/get-lambda-environment';
import type { BytecodeCachingOptions } from '../src/process-serverless/get-lambda-preload-scripts';

const NO_BYTECODE: BytecodeCachingOptions = {
  vercelEnv: undefined,
  useBytecodeCaching: undefined,
  useNativeBytecodeCaching: undefined,
  bytecodeCachingThreshold: undefined,
};

describe('getLambdaEnvironment()', () => {
  it('adds AWS_LAMBDA_HANDLER if needed', () => {
    const lambda = new NodejsLambda({
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: false,
      files: {},
      handler: 'index.js',
      runtime: 'nodejs20.x',
      awsLambdaHandler: 'handler.handler',
    });

    const environment = getLambdaEnvironment(
      lambda,
      Buffer.from(''),
      NO_BYTECODE
    );
    expect(environment.AWS_LAMBDA_HANDLER).toEqual('handler.handler');
    expect(environment.VERCEL_SHOULD_ADD_HELPERS).toBeUndefined();
    expect(environment.VERCEL_SOURCE_MAP).toBeUndefined();
    expect(environment.VERCEL_NODE_PRELOAD_SCRIPTS).toBeUndefined();
  });

  it('adds VERCEL_SHOULD_ADD_HELPERS if needed', () => {
    const lambda = new NodejsLambda({
      shouldAddHelpers: true,
      shouldAddSourcemapSupport: false,
      files: {},
      handler: 'index.js',
      runtime: 'nodejs20.x',
    });

    const environment = getLambdaEnvironment(
      lambda,
      Buffer.from(''),
      NO_BYTECODE
    );
    expect(environment.AWS_LAMBDA_HANDLER).toBeUndefined();
    expect(environment.VERCEL_SHOULD_ADD_HELPERS).toEqual('1');
    expect(environment.VERCEL_SOURCE_MAP).toBeUndefined();
    expect(environment.VERCEL_NODE_PRELOAD_SCRIPTS).toBeUndefined();
  });

  it('adds VERCEL_SOURCE_MAP if needed', () => {
    const lambda = new NodejsLambda({
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: true,
      files: {},
      handler: 'index.js',
      runtime: 'nodejs20.x',
    });

    const environment = getLambdaEnvironment(
      lambda,
      Buffer.from(''),
      NO_BYTECODE
    );
    expect(environment.AWS_LAMBDA_HANDLER).toBeUndefined();
    expect(environment.VERCEL_SHOULD_ADD_HELPERS).toBeUndefined();
    expect(environment.VERCEL_SOURCE_MAP).toEqual('1');
    expect(environment.VERCEL_NODE_PRELOAD_SCRIPTS).toEqual(
      '/opt/rust/source-map-support.js'
    );
  });

  it('adds VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION if needed', () => {
    const lambda = new NodejsLambda({
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: true,
      shouldDisableAutomaticFetchInstrumentation: true,
      files: {},
      handler: 'index.js',
      runtime: 'nodejs20.x',
    });

    const environment = getLambdaEnvironment(
      lambda,
      Buffer.from(''),
      NO_BYTECODE
    );
    expect(environment.AWS_LAMBDA_HANDLER).toBeUndefined();
    expect(environment.VERCEL_SHOULD_ADD_HELPERS).toBeUndefined();
    expect(environment.VERCEL_SOURCE_MAP).toEqual('1');
    expect(environment.VERCEL_NODE_PRELOAD_SCRIPTS).toEqual(
      '/opt/rust/source-map-support.js'
    );
    expect(
      environment.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION
    ).toEqual('1');
  });

  describe('bytecode caching', () => {
    it.each([
      'nodejs20.x',
      'nodejs22.x',
      'nodejs24.x',
    ])('adds bytecode caching to VERCEL_NODE_PRELOAD_SCRIPTS using %s', runtime => {
      const zipBuffer = Buffer.alloc(401 * 1024);
      const lambda = new NodejsLambda({
        shouldAddHelpers: false,
        shouldAddSourcemapSupport: false,
        files: {},
        handler: 'index.js',
        runtime,
      });

      const environment = getLambdaEnvironment(lambda, zipBuffer, {
        vercelEnv: 'production',
        useBytecodeCaching: '1',
        useNativeBytecodeCaching: undefined,
        bytecodeCachingThreshold: undefined,
      });
      expect(environment.AWS_LAMBDA_HANDLER).toBeUndefined();
      expect(environment.VERCEL_SHOULD_ADD_HELPERS).toBeUndefined();
      expect(environment.VERCEL_SOURCE_MAP).toBeUndefined();
      expect(environment.VERCEL_NODE_PRELOAD_SCRIPTS).toEqual(
        '/opt/rust/bytecode.js'
      );
    });

    it("doesn't add bytecode caching to VERCEL_NODE_PRELOAD_SCRIPTS if using Node.js 18", () => {
      const zipBuffer = Buffer.alloc(401 * 1024);
      const lambda = new NodejsLambda({
        shouldAddHelpers: false,
        shouldAddSourcemapSupport: false,
        files: {},
        handler: 'index.js',
        runtime: 'nodejs18.x',
      });

      const environment = getLambdaEnvironment(lambda, zipBuffer, {
        vercelEnv: 'production',
        useBytecodeCaching: '1',
        useNativeBytecodeCaching: undefined,
        bytecodeCachingThreshold: undefined,
      });
      expect(environment.AWS_LAMBDA_HANDLER).toBeUndefined();
      expect(environment.VERCEL_SHOULD_ADD_HELPERS).toBeUndefined();
      expect(environment.VERCEL_SOURCE_MAP).toBeUndefined();
      expect(environment.VERCEL_NODE_PRELOAD_SCRIPTS).toBeUndefined();
    });

    it("doesn't add bytecode caching to VERCEL_NODE_PRELOAD_SCRIPTS if VERCEL_ENV isn't production", () => {
      const zipBuffer = Buffer.alloc(401 * 1024);
      const lambda = new NodejsLambda({
        shouldAddHelpers: false,
        shouldAddSourcemapSupport: false,
        files: {},
        handler: 'index.js',
        runtime: 'nodejs20.x',
      });

      const environment = getLambdaEnvironment(lambda, zipBuffer, {
        vercelEnv: 'preview',
        useBytecodeCaching: '1',
        useNativeBytecodeCaching: undefined,
        bytecodeCachingThreshold: undefined,
      });
      expect(environment.AWS_LAMBDA_HANDLER).toBeUndefined();
      expect(environment.VERCEL_SHOULD_ADD_HELPERS).toBeUndefined();
      expect(environment.VERCEL_SOURCE_MAP).toBeUndefined();
      expect(environment.VERCEL_NODE_PRELOAD_SCRIPTS).toBeUndefined();
    });

    it("doesn't add bytecode caching to VERCEL_NODE_PRELOAD_SCRIPTS if FF is disabled", () => {
      const zipBuffer = Buffer.alloc(401 * 1024);
      const lambda = new NodejsLambda({
        shouldAddHelpers: false,
        shouldAddSourcemapSupport: false,
        files: {},
        handler: 'index.js',
        runtime: 'nodejs20.x',
      });

      const environment = getLambdaEnvironment(lambda, zipBuffer, {
        vercelEnv: 'production',
        useBytecodeCaching: '0',
        useNativeBytecodeCaching: undefined,
        bytecodeCachingThreshold: undefined,
      });
      expect(environment.AWS_LAMBDA_HANDLER).toBeUndefined();
      expect(environment.VERCEL_SHOULD_ADD_HELPERS).toBeUndefined();
      expect(environment.VERCEL_SOURCE_MAP).toBeUndefined();
      expect(environment.VERCEL_NODE_PRELOAD_SCRIPTS).toBeUndefined();
    });

    it("doesn't add bytecode caching to VERCEL_NODE_PRELOAD_SCRIPTS if lambda size below threshold", () => {
      const zipBuffer = Buffer.alloc(100 * 1024);
      const lambda = new NodejsLambda({
        shouldAddHelpers: false,
        shouldAddSourcemapSupport: false,
        files: {},
        handler: 'index.js',
        runtime: 'nodejs20.x',
      });

      const environment = getLambdaEnvironment(lambda, zipBuffer, {
        vercelEnv: 'production',
        useBytecodeCaching: '1',
        useNativeBytecodeCaching: undefined,
        bytecodeCachingThreshold: undefined,
      });
      expect(environment.AWS_LAMBDA_HANDLER).toBeUndefined();
      expect(environment.VERCEL_SHOULD_ADD_HELPERS).toBeUndefined();
      expect(environment.VERCEL_SOURCE_MAP).toBeUndefined();
      expect(environment.VERCEL_NODE_PRELOAD_SCRIPTS).toBeUndefined();
    });
  });

  it('adds next-data file to VERCEL_NODE_PRELOAD_SCRIPTS if framework is nextjs', () => {
    const lambda = new NodejsLambda({
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: false,
      files: {},
      handler: 'index.js',
      runtime: 'nodejs20.x',
      framework: { slug: 'nextjs' },
    });

    const environment = getLambdaEnvironment(
      lambda,
      Buffer.alloc(0),
      NO_BYTECODE
    );
    expect(environment.AWS_LAMBDA_HANDLER).toBeUndefined();
    expect(environment.VERCEL_SHOULD_ADD_HELPERS).toBeUndefined();
    expect(environment.VERCEL_SOURCE_MAP).toBeUndefined();
    expect(environment.VERCEL_NODE_PRELOAD_SCRIPTS).toEqual(
      '/opt/rust/next-data.js'
    );
  });

  it('combines multiple scripts to VERCEL_NODE_PRELOAD_SCRIPTS', () => {
    const lambda = new NodejsLambda({
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: true,
      files: {},
      handler: 'index.js',
      runtime: 'nodejs20.x',
      framework: { slug: 'nextjs' },
    });

    const environment = getLambdaEnvironment(
      lambda,
      Buffer.alloc(0),
      NO_BYTECODE
    );
    expect(environment.AWS_LAMBDA_HANDLER).toBeUndefined();
    expect(environment.VERCEL_SHOULD_ADD_HELPERS).toBeUndefined();
    expect(environment.VERCEL_SOURCE_MAP).toEqual('1');
    expect(environment.VERCEL_NODE_PRELOAD_SCRIPTS).toEqual(
      '/opt/rust/source-map-support.js,/opt/rust/next-data.js'
    );
  });
});
