import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type Client from '../../../src/util/client';
import {
  applyCwdProjectJsonScopeToClient,
  commandSkipsCwdProjectJsonScope,
} from '../../../src/util/apply-cwd-project-json-scope';

function minimalClient(config: { currentTeam?: string } = {}) {
  return { config: { ...config } } as unknown as Client;
}

describe('applyCwdProjectJsonScopeToClient', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    dirs.length = 0;
  });

  it('sets currentTeam for team_ orgId', async () => {
    const root = mkdtempSync(join(tmpdir(), 'apply-scope-'));
    dirs.push(root);
    mkdirSync(join(root, '.vercel'), { recursive: true });
    writeFileSync(
      join(root, '.vercel', 'project.json'),
      JSON.stringify({
        projectId: 'p1',
        orgId: 'team_abc',
        projectName: 'x',
      })
    );
    const client = minimalClient({ currentTeam: 'team_old' });
    await applyCwdProjectJsonScopeToClient(client, root);
    expect(client.config.currentTeam).toBe('team_abc');
  });

  it('clears currentTeam for non-team orgId (personal)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'apply-scope-'));
    dirs.push(root);
    mkdirSync(join(root, '.vercel'), { recursive: true });
    writeFileSync(
      join(root, '.vercel', 'project.json'),
      JSON.stringify({
        projectId: 'p1',
        orgId: 'user_personal_id',
        projectName: 'x',
      })
    );
    const client = minimalClient({ currentTeam: 'team_old' });
    await applyCwdProjectJsonScopeToClient(client, root);
    expect(client.config.currentTeam).toBeUndefined();
  });
});

describe('commandSkipsCwdProjectJsonScope', () => {
  it('skips login, switch, teams (not invite)', () => {
    expect(commandSkipsCwdProjectJsonScope('login', undefined)).toBe(true);
    expect(commandSkipsCwdProjectJsonScope('switch', undefined)).toBe(true);
    expect(commandSkipsCwdProjectJsonScope('teams', 'list')).toBe(true);
    expect(commandSkipsCwdProjectJsonScope('teams', 'invite')).toBe(false);
    expect(commandSkipsCwdProjectJsonScope('deploy', undefined)).toBe(false);
  });
});
