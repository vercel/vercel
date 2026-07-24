import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const mocks = vi.hoisted(() => ({ getTeams: vi.fn(), getUser: vi.fn() }));

// Point the on-disk cache at a per-test temp dir instead of the real config dir.
vi.mock('../../../../src/util/config/global-path', () => ({
  default: () => process.env.VC_TEST_GLOBAL_DIR ?? tmpdir(),
}));
vi.mock('../../../../src/util/teams/get-teams', () => ({
  default: mocks.getTeams,
}));
vi.mock('../../../../src/util/get-user', () => ({ default: mocks.getUser }));

import { resolveCompletionSource } from '../../../../src/util/completion/sources';

function makeClient(token: string): any {
  return { authConfig: { token }, config: {} };
}

describe('resolveCompletionSource', () => {
  beforeEach(() => {
    mocks.getTeams.mockReset();
    mocks.getUser.mockReset();
    process.env.VC_TEST_GLOBAL_DIR = mkdtempSync(join(tmpdir(), 'vc-src-'));
  });

  afterEach(() => {
    delete process.env.VC_TEST_GLOBAL_DIR;
  });

  it('returns team slugs plus the personal username', async () => {
    mocks.getUser.mockResolvedValue({ username: 'me' });
    mocks.getTeams.mockResolvedValue([{ slug: 'acme' }, { slug: 'beta' }]);
    expect(await resolveCompletionSource('team', makeClient('t1'))).toEqual([
      'acme',
      'beta',
      'me',
    ]);
  });

  it('caches non-empty results and does not re-fetch within the TTL', async () => {
    mocks.getUser.mockResolvedValue({ username: 'me' });
    mocks.getTeams.mockResolvedValue([{ slug: 'acme' }]);
    const client = makeClient('t2');
    const first = await resolveCompletionSource('team', client);
    const second = await resolveCompletionSource('team', client);
    expect(second).toEqual(first);
    expect(mocks.getTeams).toHaveBeenCalledTimes(1);
  });

  it('caches empty/failed results so a failing fetch is not repeated every TAB', async () => {
    mocks.getUser.mockRejectedValue(new Error('bad token'));
    mocks.getTeams.mockRejectedValue(new Error('bad token'));
    const client = makeClient('t3');
    expect(await resolveCompletionSource('team', client)).toEqual([]);
    expect(await resolveCompletionSource('team', client)).toEqual([]);
    expect(mocks.getTeams).toHaveBeenCalledTimes(1);
  });

  it('returns nothing without a valid access token (no fetch)', async () => {
    expect(await resolveCompletionSource('team', makeClient(''))).toEqual([]);
    expect(mocks.getTeams).not.toHaveBeenCalled();
  });
});
