import { getCachePath } from '@vercel/cli-config';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findRecentSession,
  recentKey,
  recentSessionsFile,
  rememberSession,
  RESUME_WINDOW_MS,
} from '../../../../src/commands/agent/recent';

describe('recent sessions', () => {
  it("lives in Vercel CLI's cache directory", () => {
    expect(recentSessionsFile()).toBe(
      join(getCachePath(), 'agent', 'recent-sessions.json')
    );
  });

  it('keys by project, falling back to the directory', () => {
    expect(recentKey('team_1', 'prj_1', '/a')).toBe('team_1:prj_1');
    expect(recentKey('team_1', undefined, '/a')).toBe('team_1:/a');
  });

  it('remembers a session for 30 minutes', () => {
    const file = join(
      mkdtempSync(join(tmpdir(), 'vercel-agent-recent-')),
      'nested',
      'recent.json'
    );
    rememberSession(file, 'k', 's1', 1000);
    expect(
      findRecentSession(file, 'k', 1000 + RESUME_WINDOW_MS - 1)?.sessionId
    ).toBe('s1');
    expect(
      findRecentSession(file, 'k', 1000 + RESUME_WINDOW_MS)
    ).toBeUndefined();
    expect(findRecentSession(file, 'other', 1000)).toBeUndefined();
  });
});
