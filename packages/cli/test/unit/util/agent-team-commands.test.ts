import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import { createTeam, useTeam } from '../../mocks/team';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../mocks/project';
import { useDeployment } from '../../mocks/deployment';
import { setupTmpDir } from '../../helpers/setup-unit-fixture';
import { TEAM_NOT_CHOSEN } from '../../../src/util/client';
import aiGateway from '../../../src/commands/ai-gateway';
import teams from '../../../src/commands/teams';
import remove from '../../../src/commands/remove';
import getTeamByIdOrSlug from '../../../src/util/teams/get-team-by-id-or-slug';
import { ensureTeam } from '../../../src/util/ai-gateway/ensure-team';
import { ensureTeam as ensureKeyTeam } from '../../../src/util/ai-gateway/coding-agents/key-source';
import { resolveBudgetTeam } from '../../../src/util/budget/ensure-team';

// `teams add` saves the new team; keep that off the real config file.
vi.mock('@vercel/cli-config', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/cli-config')>()),
  writeGlobalConfigFile: vi.fn(),
}));

// Commands that read the team before making any request. In an agent run
// that ignores the saved team they must choose it first, never fail with
// "no team" or treat it as absent.

async function linkTo(orgId: string) {
  const dir = setupTmpDir();
  await outputFile(
    join(dir, '.vercel', 'project.json'),
    JSON.stringify({ orgId, projectId: defaultProject.id })
  );
  client.cwd = dir;
}

/** Runs `fn`, expecting it to exit with a JSON payload, and returns it. */
async function expectAgentExit(fn: () => Promise<unknown>) {
  vi.spyOn(process, 'exit').mockImplementation(code => {
    throw new Error(`process.exit(${code})`);
  });
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  await expect(fn()).rejects.toThrow('process.exit(1)');

  return JSON.parse(logSpy.mock.calls[0][0]);
}

function useModels() {
  client.scenario.get('/v1/models', (_req, res) => {
    res.json({
      object: 'list',
      data: [
        {
          id: 'anthropic/claude-opus-4.8',
          object: 'model',
          owned_by: 'anthropic',
          name: 'Claude Opus 4.8',
          type: 'language',
        },
      ],
    });
  });
}

/** Mocks the virtual model list and records the team each request named. */
function useVirtualModels(): string[] {
  const teamIds: string[] = [];
  client.scenario.get('/ai-gateway/virtual-model-configs/list', (req, res) => {
    teamIds.push(String(req.query.teamId));
    res.json({
      virtualModelConfigs: [
        {
          virtualModelSlug: 'support-chat',
          ownerId: 'team_first',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      cursor: null,
    });
  });
  return teamIds;
}

describe('agent runs: commands that need a team before any request', () => {
  beforeEach(() => {
    process.env.VERCEL_AI_GATEWAY_URL = client.apiUrl;
    useTeam('team_first');
    client.isAgent = true;
    client.nonInteractive = true;
    client.ignoresSavedTeam = true;
    client.config.currentTeam = TEAM_NOT_CHOSEN;
  });

  afterEach(() => {
    delete process.env.VERCEL_AI_GATEWAY_URL;
    vi.restoreAllMocks();
  });

  describe('in a folder linked to one of several teams', () => {
    let user: ReturnType<typeof useUser>;

    beforeEach(async () => {
      createTeam('team_other');
      user = useUser({ version: 'northstar', defaultTeamId: 'team_other' });
      await linkTo('team_first');
    });

    it('ai-gateway commands use the linked team', async () => {
      await expect(ensureTeam(client)).resolves.toBe(true);
      expect(client.config.currentTeam).toBe('team_first');
    });

    it('the coding-agents key flow uses the linked team', async () => {
      await expect(
        ensureKeyTeam(client, { machine: true, canPrompt: false, yes: true })
      ).resolves.toBeUndefined();
      expect(client.config.currentTeam).toBe('team_first');
    });

    it('budget commands use the linked team', async () => {
      await expect(resolveBudgetTeam(client)).resolves.toMatchObject({
        id: 'team_first',
      });
    });

    it('`ai-gateway models ls --virtual` lists the linked team', async () => {
      useModels();
      const teamIds = useVirtualModels();
      client.setArgv('ai-gateway', 'models', 'list', '--virtual');

      await expect(aiGateway(client)).resolves.toBe(0);

      expect(client.stdout.getFullOutput()).toContain('vmc/support-chat');
      expect(teamIds).toEqual(['team_first']);
    });

    it('`teams members` uses the linked team', async () => {
      const requests: string[] = [];
      client.scenario.get('/v2/teams/:teamId/members', (req, res) => {
        requests.push(req.params.teamId);
        res.json({ members: [], pagination: { count: 0 } });
      });
      client.setArgv('teams', 'members', '--format', 'json');

      await expect(teams(client)).resolves.toBe(0);

      expect(requests).toEqual(['team_first']);
    });

    it('`teams request` uses the linked team', async () => {
      const requests: string[] = [];
      client.scenario.get('/v1/teams/:teamId/request', (req, res) => {
        requests.push(req.params.teamId);
        res.json({ confirmed: false, joinedFrom: { origin: 'import' } });
      });
      client.setArgv('teams', 'request');

      await expect(teams(client)).resolves.toBe(0);

      expect(requests).toEqual(['team_first']);
    });

    it('`teams invite` uses the linked team', async () => {
      const requests: string[] = [];
      client.scenario.post('/teams/:teamId/members', (req, res) => {
        requests.push(req.params.teamId);
        res.json({ username: 'new-user' });
      });
      client.setArgv('teams', 'invite', 'new@example.com');

      await expect(teams(client)).resolves.toBe(0);

      expect(requests).toEqual(['team_first']);
    });

    it('`rm` deletes in the linked team', async () => {
      const project = useProject({ ...defaultProject, id: defaultProject.id });
      useUnknownProject();
      const deployment = useDeployment({ creator: user, project });
      const deletes: string[] = [];
      client.scenario.delete('/now/deployments/:id', (req, res) => {
        deletes.push(String(req.query.teamId));
        res.json({});
      });
      client.setArgv('remove', deployment.url, '--yes');

      await expect(remove(client)).resolves.toBe(0);

      expect(deletes).toEqual(['team_first']);
    });
  });

  describe('with several teams and nothing to go on', () => {
    beforeEach(() => {
      createTeam('team_other');
      useUser({ version: 'northstar', defaultTeamId: 'team_other' });
      client.cwd = setupTmpDir();
    });

    it('looks a team up by ID without asking which team to use', async () => {
      await expect(
        getTeamByIdOrSlug(client, 'team_first')
      ).resolves.toMatchObject({ id: 'team_first' });
      expect(client.config.currentTeam).toBe(TEAM_NOT_CHOSEN);
    });

    it('`teams add` names the team it just created', async () => {
      const newTeam = { id: 'team_new', slug: 'acme', name: 'acme' };
      const renames: unknown[] = [];
      client.scenario.post('/teams', (_req, res) => {
        res.json(newTeam);
      });
      client.scenario.patch('/teams/team_new', (req, res) => {
        renames.push(req.body);
        res.json({ ...newTeam, name: 'Acme Corp' });
      });
      client.setArgv('teams', 'add', '--slug', 'acme', '--name', 'Acme Corp');

      await expect(teams(client)).resolves.toBe(0);

      expect(renames).toEqual([{ name: 'Acme Corp' }]);
    });

    it('ai-gateway commands ask instead of suggesting `vercel switch`', async () => {
      const payload = await expectAgentExit(() => ensureTeam(client));

      expect(payload.reason).toBe('missing_scope');
    });

    it('`ai-gateway models ls --virtual` asks instead of finding nothing', async () => {
      useModels();
      const teamIds = useVirtualModels();
      client.setArgv('ai-gateway', 'models', 'list', '--virtual');

      const payload = await expectAgentExit(() => aiGateway(client));

      expect(payload.reason).toBe('missing_scope');
      expect(teamIds).toEqual([]);
    });

    it('`ai-gateway leaderboard` still shows the public leaderboard', async () => {
      process.env.VERCEL_LEADERBOARD_URL = client.apiUrl;
      const teamIds: unknown[] = [];
      client.scenario.get('/api/ai/leaderboard-export', (req, res) => {
        teamIds.push(req.query.teamId);
        res.json({ dataset: 'models', modality: 'all', rows: [] });
      });
      client.setArgv('ai-gateway', 'leaderboard', 'models');

      try {
        await expect(aiGateway(client)).resolves.toBe(0);
      } finally {
        delete process.env.VERCEL_LEADERBOARD_URL;
      }

      expect(teamIds).toEqual([undefined]);
    });

    it('`ai-gateway models ls` asks, since the catalog needs a team', async () => {
      useModels();
      const teamIds = useVirtualModels();
      client.setArgv('ai-gateway', 'models', 'list');

      const payload = await expectAgentExit(() => aiGateway(client));

      expect(payload.reason).toBe('missing_scope');
      expect(teamIds).toEqual([]);
    });
  });

  describe('with one team and no link', () => {
    beforeEach(() => {
      useUser({ version: 'northstar', defaultTeamId: 'team_first' });
      client.cwd = setupTmpDir();
    });

    it('budget commands use the only team', async () => {
      await expect(resolveBudgetTeam(client)).resolves.toMatchObject({
        id: 'team_first',
      });
    });

    it('`ai-gateway models ls` includes its virtual models', async () => {
      useModels();
      const teamIds = useVirtualModels();
      client.setArgv('ai-gateway', 'models', 'list');

      await expect(aiGateway(client)).resolves.toBe(0);

      expect(client.stdout.getFullOutput()).toContain('vmc/support-chat');
      expect(teamIds).toEqual(['team_first']);
    });
  });
});
