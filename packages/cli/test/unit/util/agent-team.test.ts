import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import { writeGlobalConfigFile } from '@vercel/cli-config';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import { createTeam, useTeam } from '../../mocks/team';
import { defaultProject, useProject } from '../../mocks/project';
import { setupTmpDir } from '../../helpers/setup-unit-fixture';
import { TEAM_NOT_CHOSEN } from '../../../src/util/client';
import getScope from '../../../src/util/get-scope';
import { getLinkedProject } from '../../../src/util/projects/link';
import { introspectToken } from '../../../src/util/introspect-token';
import whoami from '../../../src/commands/whoami';
import disableTelemetry from '../../../src/commands/telemetry/disable';
import { saveDeviceCodeTokens } from '../../../src/commands/login/future';

vi.mock('@vercel/cli-config', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/cli-config')>()),
  writeGlobalConfigFile: vi.fn(),
}));

vi.mock('../../../src/util/introspect-token', () => ({
  introspectToken: vi.fn(),
}));

const writeConfigMock = vi.mocked(writeGlobalConfigFile);
const introspectTokenMock = vi.mocked(introspectToken);

/** Runs `fn`, expecting it to exit with a JSON payload, and returns it. */
async function expectAgentExit(fn: () => Promise<unknown>) {
  vi.spyOn(process, 'exit').mockImplementation(code => {
    throw new Error(`process.exit(${code})`);
  });
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  await expect(fn()).rejects.toThrow('process.exit(1)');

  return JSON.parse(logSpy.mock.calls[0][0]);
}

/** Records the requests the mock API receives at `path`. */
function recordRequests(path: string): string[] {
  const requests: string[] = [];
  client.scenario.get(path, (req, res) => {
    requests.push(req.url);
    res.json({ projects: [] });
  });
  return requests;
}

/** Creates a directory linked to `orgId` and returns it. */
async function linkedDir(orgId: string) {
  const dir = setupTmpDir();
  await outputFile(
    join(dir, '.vercel', 'project.json'),
    JSON.stringify({ orgId, projectId: 'prj_linked' })
  );
  return dir;
}

async function linkTo(orgId: string) {
  client.cwd = await linkedDir(orgId);
}

/** The `currentTeam` written by the last config write. */
function writtenTeam() {
  return writeConfigMock.mock.lastCall?.[1].currentTeam;
}

describe('agent runs', () => {
  let firstTeam: ReturnType<typeof useTeam>;

  beforeEach(() => {
    writeConfigMock.mockReset();
    firstTeam = useTeam('team_first');
    client.isAgent = true;
    client.nonInteractive = true;
    client.ignoresSavedTeam = true;
    client.config.currentTeam = TEAM_NOT_CHOSEN;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    introspectTokenMock.mockReset();
  });

  describe('with several teams', () => {
    let defaultTeam: ReturnType<typeof createTeam>;

    beforeEach(() => {
      defaultTeam = createTeam('team_default');
      useUser({ version: 'northstar', defaultTeamId: defaultTeam.id });
      client.savedTeam = defaultTeam.id;
    });

    it('asks for a team instead of using the saved or default team', async () => {
      const payload = await expectAgentExit(() => getScope(client));

      expect(payload.reason).toBe('missing_scope');
      expect(payload.userActionRequired).toBe(true);
      expect(payload.hint).toContain('Ask the user');
      // API order: the default team isn't moved to the top.
      expect(payload.choices.map((c: { id: string }) => c.id)).toEqual([
        firstTeam.id,
        defaultTeam.id,
      ]);
      expect(client.config.currentTeam).toBe(TEAM_NOT_CHOSEN);
    });

    it('lets whoami report no team instead of asking', async () => {
      client.setArgv('whoami', '--format', 'json');

      const exitCode = await whoami(client);

      expect(exitCode).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput()).team).toBeNull();
    });

    it('never sends a team request without a team', async () => {
      const requests = recordRequests('/v9/projects');

      const payload = await expectAgentExit(() => client.fetch('/v9/projects'));

      expect(payload.reason).toBe('missing_scope');
      expect(requests).toEqual([]);
    });

    it('sends requests to the team of a linked directory', async () => {
      await linkTo(firstTeam.id);
      const requests = recordRequests('/v9/projects');

      await client.fetch('/v9/projects');

      expect(requests).toEqual([`/v9/projects?teamId=${firstTeam.id}`]);
    });

    it.each([
      true,
      false,
    ])('reports the team of a linked directory (resolveLocalScope: %s)', async resolveLocalScope => {
      await linkTo(firstTeam.id);

      const scope = resolveLocalScope
        ? await getScope(client, { resolveLocalScope })
        : await getScope(client);

      expect(scope.team?.id).toBe(firstTeam.id);
      expect(client.config.currentTeam).toBe(firstTeam.id);
    });

    it('reads a link in another directory, as `deploy <path>` does', async () => {
      useProject({ ...defaultProject, id: 'prj_linked' });
      const dir = await linkedDir(firstTeam.id);
      client.cwd = setupTmpDir();

      const link = await getLinkedProject(client, { cwd: dir });

      expect(link).toMatchObject({
        status: 'linked',
        org: { type: 'team', id: firstTeam.id },
      });
    });

    it('prefers VERCEL_ORG_ID over the directory link', async () => {
      await linkTo(defaultTeam.id);
      vi.stubEnv('VERCEL_ORG_ID', firstTeam.id);
      const requests = recordRequests('/v9/projects');

      const scope = await getScope(client, { resolveLocalScope: true });
      await client.fetch('/v9/projects');

      expect(scope.team?.id).toBe(firstTeam.id);
      expect(requests).toEqual([`/v9/projects?teamId=${firstTeam.id}`]);
    });
  });

  describe('choosing the team for a request', () => {
    it('fails once on a bad token, without retrying the choice', async () => {
      let userRequests = 0;
      client.scenario.get('/v2/user', (_req, res) => {
        userRequests++;
        res.status(403).json({ error: { message: 'Not authorized' } });
      });
      const requests = recordRequests('/v9/projects');

      await expect(
        client.fetch('/v9/projects', { retry: { retries: 3, maxTimeout: 1 } })
      ).rejects.toThrow();

      expect(userRequests).toBe(1);
      expect(requests).toEqual([]);
    });

    it('sends a request that works without a team without asking', async () => {
      useUser({ version: 'northstar', defaultTeamId: firstTeam.id });
      createTeam('team_second');
      const requests = recordRequests('/v9/projects');

      await client.fetch('/v9/projects', { teamOptional: true });

      expect(requests).toEqual(['/v9/projects']);
      expect(client.config.currentTeam).toBe(TEAM_NOT_CHOSEN);
    });

    it('is shared by requests sent at the same time', async () => {
      useUser({ version: 'northstar', defaultTeamId: firstTeam.id });
      const requests = recordRequests('/v9/projects');
      const choose = vi.spyOn(
        client as unknown as { applyTeamChoice: () => Promise<void> },
        'applyTeamChoice'
      );

      await Promise.all([
        client.fetch('/v9/projects'),
        client.fetch('/v9/projects'),
        client.fetch('/v9/projects'),
      ]);

      expect(choose).toHaveBeenCalledOnce();
      expect(requests).toEqual(
        Array(3).fill(`/v9/projects?teamId=${firstTeam.id}`)
      );
    });
  });

  describe('with one team', () => {
    beforeEach(() => {
      useUser({ version: 'northstar', defaultTeamId: firstTeam.id });
      client.savedTeam = firstTeam.id;
    });

    it('uses the only team the credential can see', async () => {
      const requests = recordRequests('/v9/projects');

      await client.fetch('/v9/projects');

      expect(requests).toEqual([`/v9/projects?teamId=${firstTeam.id}`]);
      expect(client.config.currentTeam).toBe(firstTeam.id);
    });

    it('fails on a VERCEL_ORG_ID that names no team or account', async () => {
      vi.stubEnv('VERCEL_ORG_ID', 'my-team-slug');

      const payload = await expectAgentExit(() => client.fetch('/v9/projects'));

      expect(payload.reason).toBe('scope_not_accessible');
      expect(payload.message).toContain('"team_"');
      expect(client.config.currentTeam).toBe(TEAM_NOT_CHOSEN);
    });
  });

  describe('with an app token', () => {
    beforeEach(() => {
      vi.stubEnv('APP_PRINCIPAL_ENABLED', '1');
      client.scenario.get('/v2/user', (_req, res) => {
        res.status(403).json({ error: { message: 'forbidden' } });
      });
      introspectTokenMock.mockResolvedValue({
        active: true,
        client_id: 'app_dummy',
        client_name: 'Dummy App',
        team: { id: firstTeam.id, slug: firstTeam.slug },
      });
    });

    it("uses the token's own team over the directory link", async () => {
      await linkTo('team_linked');
      const requests = recordRequests('/v9/projects');

      await client.fetch('/v9/projects');

      expect(requests).toEqual([`/v9/projects?teamId=${firstTeam.id}`]);
    });

    it("fails when VERCEL_ORG_ID names a team other than the token's", async () => {
      vi.stubEnv('VERCEL_ORG_ID', 'team_other');
      const requests = recordRequests('/v9/projects');

      const payload = await expectAgentExit(() => client.fetch('/v9/projects'));

      expect(payload.reason).toBe('scope_not_accessible');
      expect(requests).toEqual([]);
    });

    it('fails the same way when the command looks up its scope first', async () => {
      // `projects ls` and most other commands start with `getScope`.
      vi.stubEnv('VERCEL_ORG_ID', 'team_other');

      const payload = await expectAgentExit(() => getScope(client));

      expect(payload.reason).toBe('scope_not_accessible');
      expect(client.config.currentTeam).toBe(TEAM_NOT_CHOSEN);
    });
  });

  describe('saved team', () => {
    beforeEach(() => {
      useUser({ version: 'northstar', defaultTeamId: firstTeam.id });
      client.savedTeam = 'team_saved';
    });

    it('is kept when writing the config', () => {
      client.config.currentTeam = 'team_this_run';

      client.writeToConfigFile();

      expect(writeConfigMock).toHaveBeenCalledOnce();
      expect(writtenTeam()).toBe('team_saved');
    });

    it('is kept by commands that change other settings', async () => {
      client.setArgv('telemetry', 'disable');

      await disableTelemetry(client);

      expect(writtenTeam()).toBe('team_saved');
      expect(writeConfigMock.mock.lastCall?.[1].telemetry?.enabled).toBe(false);
    });

    it('is replaced through updateConfig, as login does', () => {
      client.updateConfig({ currentTeam: 'team_after_login' });

      client.writeToConfigFile();

      expect(writtenTeam()).toBe('team_after_login');
    });

    it.each([
      ['a re-login keeps it', 'team_first'],
      ['a first login saves the default team', undefined],
    ])('mid-run login: %s, and the run still has no team', async (_name, saved) => {
      client.savedTeam = saved;
      vi.spyOn(client, 'persistAuthConfig').mockImplementation(() => {});

      await saveDeviceCodeTokens(client, {
        access_token: 'vca_test',
        refresh_token: 'vcr_test',
        expires_in: 3600,
      } as Parameters<typeof saveDeviceCodeTokens>[1]);

      expect(writtenTeam()).toBe('team_first');
      expect(client.config.currentTeam).toBe(TEAM_NOT_CHOSEN);
    });
  });

  describe('attached to a terminal', () => {
    beforeEach(() => {
      useUser({ version: 'northstar', defaultTeamId: firstTeam.id });
      client.nonInteractive = false;
      client.ignoresSavedTeam = false;
      delete client.config.currentTeam;
    });

    it('keeps the default team, like any interactive run', async () => {
      const scope = await getScope(client);

      expect(scope.team?.id).toBe(firstTeam.id);
    });

    it('keeps it when a command turns off prompts mid-run', async () => {
      // `project token` does this partway through a run.
      client.nonInteractive = true;

      const scope = await getScope(client);

      expect(client.ignoresSavedTeam).toBe(false);
      expect(scope.team?.id).toBe(firstTeam.id);
    });
  });
});
