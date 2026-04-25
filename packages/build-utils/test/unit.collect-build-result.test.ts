import { it, describe, expect } from 'vitest';
import { getBuildResultMetadata } from '../src/collect-build-result/get-build-result-metadata';
import { getLambdaByOutputPath } from '../src/collect-build-result/get-lambda-by-output-path';
import { isRouteMiddleware } from '../src/collect-build-result/is-route-middleware';
import { getPrerenderChain } from '../src/collect-build-result/get-prerender-chain';
import { prerenderToBuildOutputFile } from '../src/collect-build-result/prerender-to-build-output-file';
import {
  streamWithExtendedPayload,
  type ExtendedBodyData,
} from '../src/collect-build-result/stream-with-extended-payload';
import { Readable } from 'stream';
import streamToBuffer from '../src/fs/stream-to-buffer';
import FileBlob from '../src/file-blob';
import { Lambda } from '../src/lambda';
import { Prerender } from '../src/prerender';
import { EdgeFunction } from '../src/edge-function';

function createLambda(overrides: Partial<Lambda> = {}): Lambda {
  return Object.assign(Object.create(Lambda.prototype), {
    type: 'Lambda' as const,
    zipBuffer: Buffer.from('zip'),
    handler: 'index.handler',
    runtime: 'nodejs20.x',
    ...overrides,
  });
}

function createPrerender(overrides: Partial<Prerender> = {}): Prerender {
  return Object.assign(Object.create(Prerender.prototype), {
    type: 'Prerender' as const,
    expiration: 60,
    ...overrides,
  });
}

function createEdgeFunction(
  overrides: Partial<EdgeFunction> = {}
): EdgeFunction {
  return Object.assign(Object.create(EdgeFunction.prototype), {
    type: 'EdgeFunction' as const,
    deploymentTarget: 'v8-worker' as const,
    entrypoint: 'index.js',
    files: {},
    ...overrides,
  });
}

function getBoundary(prefix?: string) {
  return prefix?.split('\r\n')[0]?.replace('--', '');
}

describe('getLambdaByOutputPath', () => {
  it('returns a Lambda when the output is a Lambda', () => {
    const lambda = createLambda();
    const result = getLambdaByOutputPath({
      buildOutputMap: { 'api/hello': lambda },
      outputPath: 'api/hello',
    });
    expect(result).toBe(lambda);
  });

  it('returns the lambda from a Prerender', () => {
    const lambda = createLambda();
    const prerender = createPrerender({ lambda });
    const result = getLambdaByOutputPath({
      buildOutputMap: { page: prerender },
      outputPath: 'page',
    });
    expect(result).toBe(lambda);
  });

  it('returns undefined for missing paths', () => {
    const result = getLambdaByOutputPath({
      buildOutputMap: {},
      outputPath: 'missing',
    });
    expect(result).toBeUndefined();
  });

  it('returns undefined for EdgeFunction outputs', () => {
    const edge = createEdgeFunction();
    const result = getLambdaByOutputPath({
      buildOutputMap: { middleware: edge },
      outputPath: 'middleware',
    });
    expect(result).toBeUndefined();
  });
});

describe('isRouteMiddleware', () => {
  it('returns true for routes with middlewarePath', () => {
    const route = { src: '/.*', middlewarePath: 'middleware' };
    expect(isRouteMiddleware(route)).toBe(true);
  });

  it('returns false for routes without middlewarePath', () => {
    const route = { src: '/.*', dest: '/index' };
    expect(isRouteMiddleware(route)).toBe(false);
  });

  it('returns false when middlewarePath is not a string', () => {
    const route = { src: '/.*', middlewarePath: 123 } as any;
    expect(isRouteMiddleware(route)).toBe(false);
  });
});

describe('getPrerenderChain', () => {
  it('returns chain when chain property exists', () => {
    const prerender = createPrerender({
      chain: { outputPath: 'page.rsc', headers: { 'x-test': 'value' } },
    });
    const result = getPrerenderChain(prerender);
    expect(result).toEqual({
      outputPath: 'page.rsc',
      headers: { 'x-test': 'value' },
    });
  });

  it('returns chain from experimentalStreamingLambdaPath', () => {
    const prerender = createPrerender({
      experimentalStreamingLambdaPath: 'page.stream',
    });
    const result = getPrerenderChain(prerender);
    expect(result).toEqual({
      outputPath: 'page.stream',
      headers: { 'x-matched-path': 'page.stream' },
    });
  });

  it('returns undefined when no chain info', () => {
    const prerender = createPrerender();
    const result = getPrerenderChain(prerender);
    expect(result).toBeUndefined();
  });

  it('prefers chain over experimentalStreamingLambdaPath', () => {
    const prerender = createPrerender({
      chain: { outputPath: 'page.rsc', headers: {} },
      experimentalStreamingLambdaPath: 'page.stream',
    });
    const result = getPrerenderChain(prerender);
    expect(result?.outputPath).toBe('page.rsc');
  });
});

describe('getBuildResultMetadata', () => {
  it('detects EdgeFunction middleware from routes', () => {
    const edge = createEdgeFunction();
    const result = getBuildResultMetadata({
      buildOutputMap: { middleware: edge },
      routes: [{ src: '/.*', middlewarePath: 'middleware' }],
    });
    expect(result.middleware.size).toBe(1);
    const meta = result.middleware.get('middleware');
    expect(meta?.type).toBe('middleware');
    if (meta?.type === 'middleware') {
      expect(meta.edgeFunction).toBe(edge);
    }
  });

  it('detects Lambda middleware from routes', () => {
    const lambda = createLambda();
    const result = getBuildResultMetadata({
      buildOutputMap: { middleware: lambda },
      routes: [{ src: '/.*', middlewarePath: 'middleware' }],
    });
    expect(result.middleware.size).toBe(1);
    const meta = result.middleware.get('middleware');
    expect(meta?.type).toBe('middleware-lambda');
  });

  it('detects PPR chains', () => {
    const lambda = createLambda();
    const prerender = createPrerender({
      chain: { outputPath: 'page.rsc', headers: {} },
    });
    const result = getBuildResultMetadata({
      buildOutputMap: {
        page: prerender,
        'page.rsc': lambda,
      },
      routes: [],
    });
    expect(result.ppr.get('page.rsc')).toBe(true);
  });

  it('returns empty maps for empty inputs', () => {
    const result = getBuildResultMetadata({
      buildOutputMap: {},
      routes: [],
    });
    expect(result.middleware.size).toBe(0);
    expect(result.ppr.size).toBe(0);
  });
});

describe('streamWithExtendedPayload', () => {
  it('returns original stream when no data provided', async () => {
    const stream = Readable.from([Buffer.from('content')]);
    const result = streamWithExtendedPayload(stream);
    const buf = await streamToBuffer(result);
    expect(buf.toString()).toBe('content');
  });

  it('wraps stream with prefix and suffix', async () => {
    const stream = Readable.from([Buffer.from('body')]);
    const data: ExtendedBodyData = {
      prefix: 'PRE:',
      suffix: ':POST',
    };
    const result = streamWithExtendedPayload(stream, data);
    const buf = await streamToBuffer(result);
    expect(buf.toString()).toBe('PRE:body:POST');
  });
});

describe('prerenderToBuildOutputFile', () => {
  it('reuses the multipart boundary across prerender fallbacks', async () => {
    const initialHeaders = {
      'content-type': 'text/html',
      'x-test': 'value',
    };

    const first = await prerenderToBuildOutputFile({
      buildResult: createPrerender({
        fallback: new FileBlob({ data: 'first' }),
        initialHeaders,
      }),
      outputPath: 'first',
    });
    const second = await prerenderToBuildOutputFile({
      buildResult: createPrerender({
        fallback: new FileBlob({ data: 'second' }),
        initialHeaders,
      }),
      outputPath: 'second',
    });

    const firstBoundary = getBoundary(first?.extended.extendedBody?.prefix);
    const secondBoundary = getBoundary(second?.extended.extendedBody?.prefix);

    expect(firstBoundary).toBeDefined();
    expect(secondBoundary).toBe(firstBoundary);
    expect(first?.extended.initialHeaders).toEqual({
      'content-type': `multipart/x-nextjs-extended-payload; boundary=${firstBoundary}`,
    });
    expect(second?.extended.initialHeaders).toEqual({
      'content-type': `multipart/x-nextjs-extended-payload; boundary=${firstBoundary}`,
    });
  });
});
