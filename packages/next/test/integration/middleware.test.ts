/// <reference lib="es2019" />

process.env.NEXT_TELEMETRY_DISABLED = '1';

import type { Context } from '../types';
import { duplicateWithConfig } from '../utils';
import fs from 'fs-extra';
import path from 'path';
import * as builder from '../../';
import { createRunBuildLambda } from '../../../../test/lib/run-build-lambda';
import { EdgeFunction, Files, streamToBuffer } from '@vercel/build-utils';
import { createHash } from 'crypto';

const runBuildLambda = createRunBuildLambda(builder);

const SIMPLE_PROJECT = path.resolve(
  __dirname,
  '..',
  'fixtures',
  '00-middleware'
);

jest.setTimeout(360000);

describe('Middleware simple project', () => {
  const ctx: Context = {};

  beforeAll(async () => {
    const result = await runBuildLambda(SIMPLE_PROJECT);
    ctx.buildResult = result.buildResult;
  });

  it('orders middleware route correctly', async () => {
    const middlewareIndex = ctx.buildResult.routes.findIndex(item => {
      return !!item.middlewarePath;
    });
    const redirectIndex = ctx.buildResult.routes.findIndex(item => {
      return item.src && item.src.includes('redirect-me');
    });
    const beforeFilesIndex = ctx.buildResult.routes.findIndex(item => {
      return item.src && item.src.includes('rewrite-before-files');
    });
    const handleFileSystemIndex = ctx.buildResult.routes.findIndex(item => {
      return item.handle === 'filesystem';
    });
    expect(typeof middlewareIndex).toBe('number');
    expect(typeof redirectIndex).toBe('number');
    expect(typeof beforeFilesIndex).toBe('number');
    expect(redirectIndex).toBeLessThan(middlewareIndex);
    expect(redirectIndex).toBeLessThan(beforeFilesIndex);
    expect(middlewareIndex).toBeLessThan(beforeFilesIndex);
    expect(middlewareIndex).toBeLessThan(handleFileSystemIndex);
  });

  it('generates deterministic code', async () => {
    const result = await runBuildLambda(SIMPLE_PROJECT);
    const output = Object.entries(result.buildResult.output).filter(
      (pair): pair is [string, EdgeFunction] => {
        return pair[1].type === 'EdgeFunction';
      }
    );

    expect(output.length).toBeGreaterThanOrEqual(1);

    for (const [key, ef1] of output) {
      const ef2 = result.buildResult.output[key];
      if (ef2.type !== 'EdgeFunction') {
        return fail(`${key} is not an EdgeFunction`);
      }

      const [hash1, hash2] = await Promise.all([
        hashAllFiles(ef1.files),
        hashAllFiles(ef2.files),
      ]);
      expect(hash1).toEqual(hash2);
    }
  });

  sharedTests(ctx);
});

describe('Middleware with basePath', () => {
  let projectPath: string;
  const context: Context = {
    basePath: '/root',
  };

  beforeAll(async () => {
    projectPath = await duplicateWithConfig({
      context: context,
      path: SIMPLE_PROJECT,
      suffix: 'basepath',
    });

    const result = await runBuildLambda(projectPath);
    context.buildResult = result.buildResult;
  });

  afterAll(async () => {
    await fs.remove(projectPath);
  });

  sharedTests(context);
});

function sharedTests(ctx: Context) {
  it('worker uses `middleware` or `middlewarePath` keyword as route path', async () => {
    const routes = ctx.buildResult.routes.filter(
      route => 'middleware' in route || 'middlewarePath' in route
    );
    expect(
      routes.every(
        route =>
          route.missing[0].type === 'header' &&
          route.missing[0].key === 'x-prerender-revalidate' &&
          route.missing[0].value.length > 0
      )
    ).toBeTruthy();
    expect(routes.length).toBeGreaterThan(0);
  });
}

async function hashAllFiles(files: Files): Promise<string> {
  const hash = createHash('sha1');

  for (const [pathname, file] of Object.entries(files)) {
    hash.update(`pathname:${pathname}`);
    const buffer = await streamToBuffer(file.toStream());
    hash.update(buffer);
  }

  return hash.digest('hex');
}
