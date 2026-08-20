import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { searchProjectsByRepoRootDetailed } from '../../../../src/util/projects/search-project-across-teams';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import type { Org } from '@vercel-internals/types';

const org: Org = { type: 'team', id: 'team_dummy', slug: 'vercel' };

describe('searchProjectsByRepoRootDetailed() remote selection', () => {
  let repoDir: string;

  beforeAll(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'repo-root-remote-'));
    execSync('git init', { cwd: repoDir, stdio: 'ignore' });
    writeFileSync(join(repoDir, 'file.txt'), 'test');
    // Deliberately add `origin` last: selection must prefer it by name, not by
    // config order.
    execSync('git remote add aaa https://github.com/test/aaa.git', {
      cwd: repoDir,
      stdio: 'ignore',
    });
    execSync('git remote add zzz https://github.com/test/zzz.git', {
      cwd: repoDir,
      stdio: 'ignore',
    });
    execSync('git remote add origin https://github.com/test/origin.git', {
      cwd: repoDir,
      stdio: 'ignore',
    });
  });

  afterAll(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('uses origin without prompting when the repo has several remotes', async () => {
    useUser();
    client.scenario.get('/v9/projects', (_req, res) => {
      res.json({ projects: [], pagination: { count: 0, next: null } });
    });
    // Any prompt here would block the suggestion search on a question the user
    // cannot yet act on, so assert none is attempted.
    const select = vi.spyOn(client.input, 'select');

    const result = await searchProjectsByRepoRootDetailed({
      client,
      cwd: repoDir,
      orgs: [org],
    });

    expect(select).not.toHaveBeenCalled();
    expect(result.remote?.remoteName).toEqual('origin');
    expect(result.remote?.repoUrl).toEqual(
      'https://github.com/test/origin.git'
    );
  });
});
