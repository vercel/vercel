import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FileFsRef,
  type Files,
  type StartDevServerOptions,
} from '@vercel/build-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { startDevServer } from '../src/start-dev-server';

const workPaths = new Set<string>();
const shutdowns = new Set<() => Promise<void>>();

interface TestServerResponse {
  marker: string;
  env: string;
  pid: number;
  requestCount: number;
  url: string;
}

function filesFor(serverPath: string): Files {
  return {
    'server.ts': new FileFsRef({ fsPath: serverPath }),
  };
}

function serverSource(marker: string): string {
  return `
import { createServer } from 'node:http';

let requestCount = 0;
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({
    marker: ${JSON.stringify(marker)},
    env: process.env.SRVX_TEST_ENV,
    pid: process.pid,
    requestCount: ++requestCount,
    url: req.url,
  }));
});

server.listen(12345);
`;
}

async function request(
  port: number,
  path: string
): Promise<TestServerResponse> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  expect(response.status).toBe(200);
  return (await response.json()) as TestServerResponse;
}

afterEach(async () => {
  await Promise.allSettled([...shutdowns].map(shutdown => shutdown()));
  shutdowns.clear();
  await Promise.all(
    [...workPaths].map(workPath =>
      rm(workPath, { recursive: true, force: true })
    )
  );
  workPaths.clear();
});

describe('startDevServer', () => {
  it('serves, reuses, reloads, and shuts down a package-less TypeScript server', async () => {
    const workPath = await mkdtemp(join(tmpdir(), 'backends-srvx-dev-'));
    workPaths.add(workPath);

    const serverPath = join(workPath, 'server.ts');
    await writeFile(serverPath, serverSource('initial'));
    await mkdir(join(workPath, 'public'));
    await writeFile(join(workPath, 'public', 'hello.txt'), 'hello static');

    const opts: StartDevServerOptions = {
      files: filesFor(serverPath),
      entrypoint: 'package.json',
      workPath,
      repoRootPath: workPath,
      config: {},
      meta: { env: { SRVX_TEST_ENV: 'from-meta' } },
      onStdout: () => {},
      onStderr: () => {},
    };

    const results = await Promise.all([
      startDevServer(opts),
      startDevServer(opts),
      startDevServer(opts),
    ]);
    const initial = results[0];
    expect(initial).not.toBeNull();
    if (!initial) throw new Error('Expected srvx to start');
    expect(initial.persistent).toBe(true);
    expect(initial.shutdown).toBeTypeOf('function');
    for (const result of results) {
      if (result?.shutdown) shutdowns.add(result.shutdown);
    }
    expect(results.map(result => result?.pid)).toEqual([
      initial.pid,
      initial.pid,
      initial.pid,
    ]);
    expect(results.map(result => result?.port)).toEqual([
      initial.port,
      initial.port,
      initial.port,
    ]);

    const first = await request(initial.port, '/first');
    const second = await request(initial.port, '/second');
    expect(first).toMatchObject({
      marker: 'initial',
      env: 'from-meta',
      pid: initial.pid,
      requestCount: 1,
      url: '/first',
    });
    expect(second).toMatchObject({
      pid: initial.pid,
      requestCount: 2,
      url: '/second',
    });

    const staticResponse = await fetch(
      `http://127.0.0.1:${initial.port}/hello.txt`
    );
    expect(await staticResponse.text()).toBe('hello static');

    await writeFile(serverPath, serverSource('updated'));
    const updatedFiles = filesFor(serverPath);
    const updated = await startDevServer({
      ...opts,
      files: updatedFiles,
    });
    expect(updated).not.toBeNull();
    if (!updated) throw new Error('Expected srvx to reload');
    if (updated.shutdown) shutdowns.add(updated.shutdown);
    expect(updated.pid).not.toBe(initial.pid);
    expect(await request(updated.port, '/updated')).toMatchObject({
      marker: 'updated',
      env: 'from-meta',
      pid: updated.pid,
      requestCount: 1,
      url: '/updated',
    });

    const reconfigured = await startDevServer({
      ...opts,
      files: updatedFiles,
      meta: { env: { SRVX_TEST_ENV: 'updated-env' } },
    });
    expect(reconfigured).not.toBeNull();
    if (!reconfigured) throw new Error('Expected srvx to restart');
    if (reconfigured.shutdown) shutdowns.add(reconfigured.shutdown);
    expect(reconfigured.pid).not.toBe(updated.pid);
    expect(await request(reconfigured.port, '/updated-env')).toMatchObject({
      marker: 'updated',
      env: 'updated-env',
      pid: reconfigured.pid,
      requestCount: 1,
      url: '/updated-env',
    });

    await reconfigured.shutdown?.();
    await expect(
      fetch(`http://127.0.0.1:${reconfigured.port}/after-shutdown`)
    ).rejects.toThrow();
  });

  it('reports an entrypoint that exits before listening', async () => {
    const workPath = await mkdtemp(join(tmpdir(), 'backends-srvx-error-'));
    workPaths.add(workPath);

    const serverPath = join(workPath, 'server.ts');
    await writeFile(serverPath, "throw new Error('startup failure');");
    const stderr: Buffer[] = [];

    await expect(
      startDevServer({
        files: filesFor(serverPath),
        entrypoint: 'package.json',
        workPath,
        repoRootPath: workPath,
        config: {},
        meta: {},
        onStdout: () => {},
        onStderr: data => stderr.push(data),
      })
    ).rejects.toThrow(/server\.ts.*exit code 1/i);
    expect(Buffer.concat(stderr).toString()).toContain('startup failure');
  });
});
