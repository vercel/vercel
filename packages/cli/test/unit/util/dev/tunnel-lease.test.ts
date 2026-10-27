import type { Org } from '@vercel-internals/types';
import { describe, expect, it, vi } from 'vitest';
import type Client from '../../../../src/util/client';
import {
  releaseAlias,
  reserveAlias,
} from '../../../../src/util/dev/tunnel/lease';
import { APIError } from '../../../../src/util/errors-ts';

const org = { id: 'team_1' } as Org;
const status = (code: number) =>
  new APIError('Request failed', new Response(null, { status: code }));
const answering = (respond: () => unknown) =>
  ({ fetch: vi.fn(async () => respond()) }) as unknown as Client;

describe('reserveAlias', () => {
  it('asks api-dev-tunnel for the name, for the project', async () => {
    const client = answering(() => ({ alias: 'demo.vercel.sh' }));

    expect(await reserveAlias(client, org, 'prj_1', 'demo.vercel.sh')).toBe(
      'reserved'
    );
    expect(client.fetch).toHaveBeenCalledWith('/v1/dev-tunnel/aliases', {
      method: 'POST',
      accountId: 'team_1',
      body: { projectId: 'prj_1', alias: 'demo.vercel.sh' },
    });
  });

  it("says when another tunnel's lease is live", async () => {
    const client = answering(() => {
      throw status(409);
    });

    expect(await reserveAlias(client, org, 'prj_1', 'demo.vercel.sh')).toBe(
      'held'
    );
  });

  it('says when the service takes no reservations', async () => {
    const client = answering(() => {
      throw status(404);
    });

    expect(await reserveAlias(client, org, 'prj_1', 'demo.vercel.sh')).toBe(
      'unsupported'
    );
  });

  it('throws any other failure', async () => {
    const client = answering(() => {
      throw status(500);
    });

    await expect(
      reserveAlias(client, org, 'prj_1', 'demo.vercel.sh')
    ).rejects.toMatchObject({ status: 500 });
  });
});

describe('releaseAlias', () => {
  it('gives the name up, bounded so Ctrl-C stays quick', async () => {
    const client = answering(() => ({}));

    await releaseAlias(client, org, 'prj_1', 'demo.vercel.sh');

    expect(client.fetch).toHaveBeenCalledWith(
      '/v1/dev-tunnel/aliases/demo.vercel.sh?projectId=prj_1',
      expect.objectContaining({
        method: 'DELETE',
        accountId: 'team_1',
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("doesn't throw when it can't, since the lease lapses on its own", async () => {
    const client = answering(() => {
      throw status(500);
    });

    await expect(
      releaseAlias(client, org, 'prj_1', 'demo.vercel.sh')
    ).resolves.toBeUndefined();
  });
});
