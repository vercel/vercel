import { describe, expect, test } from 'vitest';
import {
  describeRunnerError,
  snapshotCacheKey,
  snapshotEntryUsable,
} from '../../../../scripts/testserver/runner.mjs';

describe('snapshotCacheKey()', () => {
  const recipeKey = 'a'.repeat(64);
  const creds = { teamId: 'team_1', projectId: 'prj_1' };

  test('is stable for the same recipe and owner', () => {
    expect(snapshotCacheKey(recipeKey, creds)).toBe(
      snapshotCacheKey(recipeKey, { ...creds })
    );
    expect(snapshotCacheKey(recipeKey, creds)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('changes with the recipe key, team or project', () => {
    const key = snapshotCacheKey(recipeKey, creds);
    expect(snapshotCacheKey('b'.repeat(64), creds)).not.toBe(key);
    expect(
      snapshotCacheKey(recipeKey, { ...creds, teamId: 'team_2' })
    ).not.toBe(key);
    expect(
      snapshotCacheKey(recipeKey, { ...creds, projectId: 'prj_2' })
    ).not.toBe(key);
  });
});

describe('snapshotEntryUsable()', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');

  test('needs more than an hour left', () => {
    expect(
      snapshotEntryUsable(
        { snapshotId: 'snap_1', expiresAt: '2026-01-01T02:00:00Z' },
        now
      )
    ).toBe(true);
    expect(
      snapshotEntryUsable(
        { snapshotId: 'snap_1', expiresAt: '2026-01-01T00:30:00Z' },
        now
      )
    ).toBe(false);
  });

  test('rejects malformed entries', () => {
    expect(snapshotEntryUsable(undefined, now)).toBe(false);
    expect(snapshotEntryUsable({ expiresAt: '2027-01-01' }, now)).toBe(false);
    expect(
      snapshotEntryUsable({ snapshotId: 'snap_1', expiresAt: 'later' }, now)
    ).toBe(false);
  });
});

describe('describeRunnerError()', () => {
  test('explains rejected credentials', () => {
    const err = Object.assign(new Error('Status code 403 is not ok'), {
      response: { status: 403 },
    });
    expect(describeRunnerError(err)).toMatch(
      /HTTP 403.*credentials were rejected/
    );
  });

  test('passes other errors through', () => {
    expect(describeRunnerError(new Error('boom'))).toBe('boom');
  });
});
