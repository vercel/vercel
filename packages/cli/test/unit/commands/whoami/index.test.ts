import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam, useTeams } from '../../../mocks/team';
import whoami from '../../../../src/commands/whoami';

describe('whoami', () => {
  const tmpDirs: string[] = [];

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'whoami-test-'));
    tmpDirs.push(dir);
    client.cwd = dir;
  });

  afterEach(() => {
    for (const d of tmpDirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    tmpDirs.length = 0;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'whoami';

      client.setArgv(command, '--help');
      const exitCodePromise = whoami(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('should reject invalid arguments', async () => {
    client.setArgv('--invalid');
    const result = await whoami(client);
    expect(result).toBe(1);
  });

  it('should print the Vercel username', async () => {
    const user = useUser();
    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(`> ${user.username}\n`);
  });

  it('should print only the Vercel username when output is not a TTY', async () => {
    const user = useUser();
    client.stdout.isTTY = false;
    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    await expect(client.stdout).toOutput(`${user.username}\n`);
  });

  it('--scope overrides team from .vercel/project.json', async () => {
    const user = useUser();
    const teamLinked = 'team_in_project_json';
    const teamScoped = 'team_from_flag';
    const linkedTeam = useTeam(teamLinked);
    const linkedSlug = linkedTeam.slug;

    client.scenario.get(`/teams/${teamScoped}`, (_req, res) => {
      res.json({
        id: teamScoped,
        slug: 'scope-flag-slug',
        name: 'Scoped',
        creatorId: 'x',
        created: '2017-04-29T17:21:54.514Z',
        avatar: null,
      });
    });

    client.config.currentTeam = teamScoped;
    client.setArgv('whoami', '--scope', 'scope-flag-slug');

    mkdirSync(join(client.cwd, '.vercel'), { recursive: true });
    writeFileSync(
      join(client.cwd, '.vercel', 'project.json'),
      JSON.stringify({
        projectId: 'prj_test',
        orgId: teamLinked,
        projectName: 'app',
      }),
      'utf8'
    );

    const exitCode = await whoami(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput(
      `> ${user.username} (scope-flag-slug)\n`
    );
    expect(client.stderr.getFullOutput()).not.toContain(`(${linkedSlug})`);
  });

  it('prints username and team when .vercel/project.json sets a team orgId', async () => {
    const user = useUser();
    const teamId = 'team_from_project_json';
    const teamSlug = useTeam(teamId).slug;

    mkdirSync(join(client.cwd, '.vercel'), { recursive: true });
    writeFileSync(
      join(client.cwd, '.vercel', 'project.json'),
      JSON.stringify({
        projectId: 'prj_test',
        orgId: teamId,
        projectName: 'app',
      }),
      'utf8'
    );

    const exitCode = await whoami(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput(`> ${user.username} (${teamSlug})\n`);
  });

  it('at repo root with repo.json: single shared org shows that team', async () => {
    const user = useUser();
    const teamId = 'team_repo_shared';
    const teamSlug = useTeam(teamId).slug;

    mkdirSync(join(client.cwd, '.git'), { recursive: true });
    writeFileSync(
      join(client.cwd, '.git', 'config'),
      '[remote "origin"]\n\turl = https://github.com/o/r.git\n',
      'utf8'
    );
    mkdirSync(join(client.cwd, '.vercel'), { recursive: true });
    writeFileSync(
      join(client.cwd, '.vercel', 'repo.json'),
      JSON.stringify({
        remoteName: 'origin',
        projects: [
          {
            id: 'p1',
            name: 'web',
            directory: 'apps/web',
            orgId: teamId,
          },
          {
            id: 'p2',
            name: 'api',
            directory: 'apps/api',
            orgId: teamId,
          },
        ],
      }),
      'utf8'
    );

    const exitCode = await whoami(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput(`> ${user.username} (${teamSlug})\n`);
  });

  it('in repo subfolder without project.json: scope from repo.json project for cwd', async () => {
    const user = useUser();
    const teamId = 'team_subfolder_repo';
    const teamSlug = useTeam(teamId).slug;

    const root = client.cwd;
    mkdirSync(join(root, '.git'), { recursive: true });
    writeFileSync(
      join(root, '.git', 'config'),
      '[remote "origin"]\n\turl = https://github.com/o/r.git\n',
      'utf8'
    );
    mkdirSync(join(root, '.vercel'), { recursive: true });
    writeFileSync(
      join(root, '.vercel', 'repo.json'),
      JSON.stringify({
        remoteName: 'origin',
        projects: [
          {
            id: 'p1',
            name: 'web',
            directory: 'apps/web',
            orgId: teamId,
          },
        ],
      }),
      'utf8'
    );
    mkdirSync(join(root, 'apps', 'web'), { recursive: true });
    client.cwd = join(root, 'apps', 'web');

    const exitCode = await whoami(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput(`> ${user.username} (${teamSlug})\n`);
  });

  it('at repo root with repo.json: differing orgIds falls back to default scope (username only)', async () => {
    const user = useUser();
    useTeams('team_a');
    client.scenario.get('/teams/team_b', (_req, res) => {
      res.json({
        id: 'team_b',
        slug: 'team-b-slug',
        name: 'B',
        creatorId: 'x',
        created: '2017-04-29T17:21:54.514Z',
        avatar: null,
      });
    });

    mkdirSync(join(client.cwd, '.git'), { recursive: true });
    writeFileSync(
      join(client.cwd, '.git', 'config'),
      '[remote "origin"]\n\turl = https://github.com/o/r.git\n',
      'utf8'
    );
    mkdirSync(join(client.cwd, '.vercel'), { recursive: true });
    writeFileSync(
      join(client.cwd, '.vercel', 'repo.json'),
      JSON.stringify({
        remoteName: 'origin',
        projects: [
          {
            id: 'p1',
            name: 'web',
            directory: 'apps/web',
            orgId: 'team_a',
          },
          {
            id: 'p2',
            name: 'api',
            directory: 'apps/api',
            orgId: 'team_b',
          },
        ],
      }),
      'utf8'
    );

    const exitCode = await whoami(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput(`> ${user.username}\n`);
  });

  describe('--format', () => {
    it('tracks telemetry for --format json', async () => {
      useUser();
      client.setArgv('whoami', '--format', 'json');
      const exitCode = await whoami(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:format',
          value: 'json',
        },
      ]);
    });

    it('outputs user information as JSON', async () => {
      const user = useUser();
      client.setArgv('whoami', '--format', 'json');
      const exitCode = await whoami(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toMatchObject({
        username: user.username,
        email: user.email,
        name: user.name,
        scope: user.username,
      });
    });
  });
});
