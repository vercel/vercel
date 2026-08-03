import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BuildOptions, Lambda } from '@vercel/build-utils';
import { build } from '../src';

describe('Go handler build', () => {
  let workPath: string;

  beforeEach(async () => {
    workPath = await mkdtemp(join(tmpdir(), 'vercel-go-handler-'));
  });

  afterEach(async () => {
    await rm(workPath, { recursive: true, force: true });
  });

  it('builds handlers as executable HTTP servers', async () => {
    await Promise.all([
      writeFile(
        join(workPath, 'go.mod'),
        'module example.com/handler\n\ngo 1.15\n'
      ),
      writeFile(
        join(workPath, 'index.go'),
        `package handler

import "net/http"

func Handler(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}
`
      ),
    ]);

    const result = await build({
      files: {},
      entrypoint: 'index.go',
      workPath,
      repoRootPath: workPath,
      config: {
        functions: {
          'index.go': {
            architecture: 'arm64',
            memory: 1024,
            maxDuration: 30,
          },
        },
      },
      meta: { skipDownload: true },
    } satisfies BuildOptions);

    const lambda = result.output as Lambda;
    expect(lambda.handler).toBe('executable');
    expect(lambda.runtime).toBe('executable');
    expect(lambda.runtimeLanguage).toBe('go');
    expect(lambda.architecture).toBe('arm64');
    expect(lambda.memory).toBe(1024);
    expect(lambda.maxDuration).toBe(30);
    expect(lambda.supportsResponseStreaming).toBe(true);
    expect(lambda.files?.executable.mode).toBe(0o755);
    expect(lambda.files?.['user-server'].mode).toBe(0o755);
    expect(lambda.files?.['.vercel-runtime-control-v1']).toBeDefined();
    expect(lambda.files?.bootstrap).toBeUndefined();
  });

  it('uses the executable runtime for module-less main packages', async () => {
    await writeFile(
      join(workPath, 'index.go'),
      `package main

import "net/http"

func Handler(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}
`
    );

    const result = await build({
      files: {},
      entrypoint: 'index.go',
      workPath,
      repoRootPath: workPath,
      config: {},
      meta: { skipDownload: true },
    } satisfies BuildOptions);

    const lambda = result.output as Lambda;
    expect(lambda.handler).toBe('executable');
    expect(lambda.runtime).toBe('executable');
    expect(lambda.files?.['user-server'].mode).toBe(0o755);
  });
});
