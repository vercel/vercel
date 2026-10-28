import type { Org } from '@vercel-internals/types';
import { describe, expect, it, vi } from 'vitest';
import type Client from '../../../../src/util/client';
import { APIError } from '../../../../src/util/errors-ts';
import {
  aliasUnder,
  assignAlias,
  isAliasLabel,
  tunnelAliasLabel,
} from '../../../../src/util/dev/tunnel/alias';

const team = { slug: 'vercel', type: 'team' } as const;

describe('tunnelAliasLabel', () => {
  it('names the project, developer and team, like a branch alias', () => {
    expect(tunnelAliasLabel('vercel-site', 'vercel-eddie', team)).toBe(
      'vercel-site-tunnel-vercel-eddie-vercel'
    );
  });

  it('leaves out the scope of a personal account, which is the developer', () => {
    expect(
      tunnelAliasLabel('app', 'eddie', { slug: 'eddie', type: 'user' })
    ).toBe('app-tunnel-eddie');
  });

  it('makes a valid DNS label of any name', () => {
    expect(tunnelAliasLabel('My_App.v2', 'Eddie', team)).toBe(
      'my-app-v2-tunnel-eddie-vercel'
    );
  });

  it('fits a long one into a label, kept distinct by a hash', () => {
    const long = 'a'.repeat(70);
    const label = tunnelAliasLabel(long, 'eddie', team);

    expect(label.length).toBeLessThanOrEqual(63);
    expect(label).toMatch(/^a+-[0-9a-f]{8}$/);
    expect(tunnelAliasLabel(`${long}b`, 'eddie', team)).not.toBe(label);
  });
});

describe('aliasUnder', () => {
  it("takes the suffix of the deployment's own URL", () => {
    expect(
      aliasUnder('app-tunnel-eddie', 'https://app-abc123.vercel.app')
    ).toBe('app-tunnel-eddie.vercel.app');
    // A team's or project's Preview Deployment Suffix.
    expect(aliasUnder('site-tunnel-eddie', 'https://site-abc.vercel.sh')).toBe(
      'site-tunnel-eddie.vercel.sh'
    );
    expect(
      aliasUnder('app-tunnel-eddie', 'https://app-abc.preview.example.com')
    ).toBe('app-tunnel-eddie.preview.example.com');
  });
});

describe('assignAlias', () => {
  const org = { id: 'team_1' } as Org;
  const status = (code: number) =>
    new APIError('Request failed', new Response(null, { status: code }));
  // A 409 on assigning, and a lookup that finds the alias where it points.
  const conflicting = (pointsAt?: string) =>
    ({
      fetch: vi.fn(async (_url: string, init?: { method?: string }) => {
        if (init?.method === 'POST') throw status(409);
        if (pointsAt === undefined) throw status(404);
        return { deploymentId: pointsAt };
      }),
    }) as unknown as Client;

  it('takes a 409 as done when the alias points at the deployment already', async () => {
    await expect(
      assignAlias(conflicting('dpl_1'), org, 'dpl_1', 'a.vercel.app')
    ).resolves.toBeUndefined();
  });

  it("fails on a 409 when the alias isn't the deployment's", async () => {
    // One another account holds, which the team can't see.
    await expect(
      assignAlias(conflicting(), org, 'dpl_1', 'nextjs.vercel.app')
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      assignAlias(conflicting('dpl_other'), org, 'dpl_1', 'a.vercel.app')
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('isAliasLabel', () => {
  it('takes a DNS label', () => {
    expect(isAliasLabel('eddie')).toBe(true);
    expect(isAliasLabel('my-demo-2')).toBe(true);
    expect(isAliasLabel('a'.repeat(63))).toBe(true);
  });

  it('refuses anything else, a domain included', () => {
    for (const name of [
      '',
      'Eddie',
      '-demo',
      'demo-',
      'my_demo',
      'demo.example.com',
      'a'.repeat(64),
    ]) {
      expect(isAliasLabel(name)).toBe(false);
    }
  });
});
