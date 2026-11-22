import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGlobalConfigFile, writeGlobalConfigFile } from '../src/cli-config';

describe('global config passthrough', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-config-passthrough-'));
  const configPath = join(dir, 'config.json');

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('preserves unknown keys through write + read', () => {
    writeGlobalConfigFile(configPath, {
      currentTeam: 'team_a',
      cachedTeamIds: { 'my-team': 'team_mine' },
    } as Parameters<typeof writeGlobalConfigFile>[1]);

    const onDisk = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(onDisk.cachedTeamIds).toEqual({ 'my-team': 'team_mine' });

    const reread = readGlobalConfigFile(configPath) as Record<string, unknown>;
    expect(reread.cachedTeamIds).toEqual({ 'my-team': 'team_mine' });
  });
});
