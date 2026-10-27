import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isReusable,
  PROXY_MAX_AGE_MS,
  proxyKey,
  proxyRecordPath,
  readProxy,
  rememberProxy,
} from '../../../../src/util/dev/tunnel/reuse';

let dir: string;
let record: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tunnel-reuse-'));
  record = proxyRecordPath('team_1', 'prj_1', dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const parts = {
  files: { 'api/tunnel.ts': 'source' },
  env: { DEV_TUNNEL_SERVER_TOKEN: 'server.tnl_1.sfo1.secret' },
};
const now = 1_800_000_000_000;
const proxy = {
  key: proxyKey(parts),
  id: 'dpl_1',
  url: 'https://p.vercel.app',
};
const ready = (age: number) => async () => ({
  readyState: 'READY',
  createdAt: now - age,
});

describe('proxy reuse', () => {
  it('reads back the remembered deployment', async () => {
    await rememberProxy(record, proxy);

    expect(await readProxy(record)).toEqual(proxy);
  });

  it('remembers nothing without a record, or with a partial one', async () => {
    expect(await readProxy(record)).toBe(undefined);

    await rememberProxy(record, proxy);
    await writeFile(record, JSON.stringify({ key: proxy.key, id: 'dpl_1' }));
    expect(await readProxy(record)).toBe(undefined);
  });

  it('reuses a ready deployment built from the same key', async () => {
    const getDeployment = vi.fn(ready(60_000));

    expect(await isReusable(proxy, proxy.key, getDeployment, now)).toBe(true);
    expect(getDeployment).toHaveBeenCalledWith('dpl_1');
  });

  it('deploys again when anything the proxy is built from changes', async () => {
    const changed = proxyKey({
      ...parts,
      env: { DEV_TUNNEL_SERVER_TOKEN: 'server.tnl_1.sfo1.renewed' },
    });

    expect(await isReusable(proxy, changed, ready(60_000), now)).toBe(false);
  });

  it('deploys again once the deployment is too old', async () => {
    expect(
      await isReusable(proxy, proxy.key, ready(PROXY_MAX_AGE_MS - 1), now)
    ).toBe(true);
    expect(
      await isReusable(proxy, proxy.key, ready(PROXY_MAX_AGE_MS), now)
    ).toBe(false);
    expect(
      await isReusable(
        proxy,
        proxy.key,
        async () => ({ readyState: 'READY' }),
        now
      )
    ).toBe(false);
  });

  it('deploys again when the deployment is gone or not ready', async () => {
    expect(
      await isReusable(
        proxy,
        proxy.key,
        async () => ({ readyState: 'ERROR', createdAt: now }),
        now
      )
    ).toBe(false);
    expect(
      await isReusable(
        proxy,
        proxy.key,
        () => Promise.reject(new Error('404')),
        now
      )
    ).toBe(false);
  });

  it('keeps the server token out of the record', async () => {
    await rememberProxy(record, proxy);
    expect(await readFile(record, 'utf8')).not.toContain('secret');
  });
});
