import { ChildProcess } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnCommand } from '@vercel/build-utils';
import output from '../../../../src/output-manager';
import DevServer from '../../../../src/util/dev/server';

vi.mock('@vercel/build-utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/build-utils')>()),
  spawnCommand: vi.fn(),
}));

vi.mock('get-port', () => ({ default: vi.fn(async () => 4321) }));

vi.mock('../../../../src/util/dev/port-utils', () => ({
  checkForPort: vi.fn(async () => '127.0.0.1'),
  waitForPortToFree: vi.fn(async () => true),
}));

vi.mock('../../../../src/util/tree-kill', () => ({
  treeKill: vi.fn(async () => {}),
}));

type FakeChild = ChildProcess & { stdout: PassThrough; stderr: PassThrough };

function spawnedTokens(): (string | undefined)[] {
  return vi
    .mocked(spawnCommand)
    .mock.calls.map(([, options]) => options?.env?.VERCEL_OIDC_TOKEN);
}

describe('DevServer env values', () => {
  const children: FakeChild[] = [];
  let cwd: string;
  let server: DevServer;

  beforeEach(async () => {
    vi.mocked(spawnCommand).mockImplementation(() => {
      const child = Object.assign(new ChildProcess(), {
        pid: 1000 + children.length,
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      });
      children.push(child);
      return child;
    });
    vi.spyOn(output, 'log').mockImplementation(() => {});
    vi.spyOn(output, 'print').mockImplementation(() => {});
    cwd = await mkdtemp(join(tmpdir(), 'vc-dev-env-values-'));
    server = new DevServer(cwd, {
      projectSettings: { devCommand: 'next dev --port $PORT' },
      envValues: { VERCEL_OIDC_TOKEN: 'first' },
      queuePort: 0,
      runtimeCachePort: 0,
      schedulesPort: 0,
    });
    vi.spyOn(server, 'updateBuildMatches').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await server.stop();
    await rm(cwd, { recursive: true, force: true });
    for (const child of children.splice(0)) {
      child.stdout.destroy();
      child.stderr.destroy();
      child.removeAllListeners();
    }
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('restarts the Development Command with updated cloud values', async () => {
    await server.start(0, '127.0.0.1');

    await server.updateEnvValues({ VERCEL_OIDC_TOKEN: 'second' });

    expect(spawnedTokens()).toEqual(['first', 'second']);
  });

  it('leaves the Development Command alone when .env files supply the env', async () => {
    await writeFile(join(cwd, '.env'), 'VERCEL_OIDC_TOKEN=local\n');
    await server.start(0, '127.0.0.1');

    await server.updateEnvValues({ VERCEL_OIDC_TOKEN: 'second' });

    expect(spawnedTokens()).toEqual(['local']);
  });
});
