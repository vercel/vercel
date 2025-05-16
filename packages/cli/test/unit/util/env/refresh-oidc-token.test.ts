import { beforeEach, describe, expect, vi, it } from 'vitest';
import { refreshOidcToken } from '../../../../src/util/env/refresh-oidc-token';
import { client } from '../../../mocks/client';

vi.mock('perf_hooks', () => ({
  performance: {
    timeOrigin: 0,
    now: () => 1_000,
  },
}));

describe('refreshOidcToken', () => {
  const projectId = 'test';
  const env: Record<string, string> = {};
  const source = 'vercel-cli:dev';
  let controller: AbortController;
  let exp: number;
  let jwt: string | undefined;
  let omitJwt: boolean;

  beforeEach(() => {
    controller = new AbortController();
    exp = 0;
    jwt = undefined;
    omitJwt = false;

    client.setArgv('--debug');

    client.scenario.get(`/v3/env/pull/${projectId}`, (_, res) => {
      if (omitJwt) {
        return res.json({ env: {} });
      }
      const env = { VERCEL_OIDC_TOKEN: jwt ?? mockOidcToken(++exp) };
      return res.json({ env });
    });
  });

  it('should do nothing if an initial VERCEL_OIDC_TOKEN is absent', async () => {
    const res = await refreshOidcToken(
      controller.signal,
      client,
      projectId,
      env,
      source,
      0
    ).next();
    expect(res.value).toEqual(undefined);
    expect(res.done).toEqual(true);
    await expect(client.stderr).toOutput(
      'VERCEL_OIDC_TOKEN is absent; disabling refreshes'
    );
  });

  it('should do nothing if the initial VERCEL_OIDC_TOKEN is invalid', async () => {
    const env = { VERCEL_OIDC_TOKEN: 'foo' };
    const res = await refreshOidcToken(
      controller.signal,
      client,
      projectId,
      env,
      source,
      0
    ).next();
    expect(res.value).toEqual(undefined);
    expect(res.done).toEqual(true);
    await expect(client.stderr).toOutput(
      'VERCEL_OIDC_TOKEN is invalid; disabling refreshes'
    );
  });

  it('should issue a debug log when the token is already expired', async () => {
    const env = { VERCEL_OIDC_TOKEN: mockOidcToken(exp) };
    await refreshOidcToken(
      controller.signal,
      client,
      projectId,
      env,
      source,
      0
    ).next();
    await expect(client.stderr).toOutput(
      'VERCEL_OIDC_TOKEN expired 1s ago; refreshing in 0s'
    );
  });

  it('should issue a debug log when the token will be refreshed (within 15 minutes of expiry)', async () => {
    const env = { VERCEL_OIDC_TOKEN: mockOidcToken(901) }; // 15 minutes from now
    await refreshOidcToken(
      controller.signal,
      client,
      projectId,
      env,
      source,
      0
    ).next();
    await expect(client.stderr).toOutput(
      'VERCEL_OIDC_TOKEN expires in 900s; refreshing in 0s'
    );
  });

  it('should issue a debug log when the token will be refreshed (more than 15 minutes until expiry)', async () => {
    const env = { VERCEL_OIDC_TOKEN: mockOidcToken(902) }; // 15 minutes and 1 second from now
    await refreshOidcToken(
      controller.signal,
      client,
      projectId,
      env,
      source,
      0
    ).next();
    await expect(client.stderr).toOutput(
      'VERCEL_OIDC_TOKEN expires in 901s; refreshing in 1s'
    );
  });

  it('should only yield subsequent VERCEL_OIDC_TOKEN values', async () => {
    exp = 2;
    const env = { VERCEL_OIDC_TOKEN: mockOidcToken(exp) };
    const res = await refreshOidcToken(
      controller.signal,
      client,
      projectId,
      env,
      source,
      0
    ).next();
    expect(res.value).toEqual(mockOidcToken(3));
    expect(res.done).toEqual(false);
  });

  it('should cease refreshes if a subsequent VERCEL_OIDC_TOKEN is missing', async () => {
    omitJwt = true;
    const env = { VERCEL_OIDC_TOKEN: mockOidcToken(exp) };
    const res = await refreshOidcToken(
      controller.signal,
      client,
      projectId,
      env,
      source,
      0
    ).next();
    expect(res.value).toEqual(undefined);
    expect(res.done).toEqual(true);
  });

  it('should cease refreshes if the subsequent VERCEL_OIDC_TOKEN is invalid', async () => {
    const env = { VERCEL_OIDC_TOKEN: mockOidcToken(exp) };
    jwt = 'foo';
    const res = await refreshOidcToken(
      controller.signal,
      client,
      projectId,
      env,
      source,
      0
    ).next();
    expect(res.value).toEqual(undefined);
    expect(res.done).toEqual(true);
  });
});

function mockOidcToken(exp: number): string {
  const header = { typ: 'JWT', alg: 'none' };
  const payload = { exp };

  return [
    Buffer.from(JSON.stringify(header), 'utf8').toString('base64url'),
    Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url'),
    'deadbeef',
  ].join('.');
}
