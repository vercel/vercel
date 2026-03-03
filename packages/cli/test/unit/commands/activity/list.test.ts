import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import activity from '../../../../src/commands/activity';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_activity',
      name: 'activity-project',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: {
      id: 'team_dummy',
      slug: 'my-team',
      type: 'team',
    },
  });
}

function mockTeamScope(teamSlug = 'my-team') {
  mockedGetScope.mockResolvedValue({
    contextName: teamSlug,
    team: { id: 'team_dummy', slug: teamSlug } as any,
    user: { id: 'user_dummy' } as any,
  });
}

describe('activity ls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
  });

  it('lists activity events by default without subcommand', async () => {
    let requestQuery: any;
    client.scenario.get('/v3/events', (req, res) => {
      requestQuery = req.query;
      res.json({
        events: [
          {
            id: 'uev_1',
            createdAt: 1700000000000,
            text: 'Deployed to production',
            type: 'deployment',
            principalId: 'user_1',
            principal: { type: 'user', username: 'jane' },
          },
        ],
      });
    });

    client.setArgv('activity');

    const exitCode = await activity(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.projectIds).toBe('prj_activity');
    expect(requestQuery.teamId).toBe('team_dummy');
    expect(client.stderr.getFullOutput()).toContain('Deployed to production');
  });

  it('lists activity events with explicit ls subcommand', async () => {
    let requestQuery: any;
    client.scenario.get('/v3/events', (req, res) => {
      requestQuery = req.query;
      res.json({
        events: [
          {
            id: 'uev_1',
            createdAt: 1700000000000,
            text: 'Deployed to production',
            type: 'deployment',
            principalId: 'user_1',
            principal: { type: 'user', username: 'jane' },
          },
        ],
      });
    });

    client.setArgv('activity', 'ls');

    const exitCode = await activity(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.projectIds).toBe('prj_activity');
    expect(requestQuery.teamId).toBe('team_dummy');
    expect(client.stderr.getFullOutput()).toContain('Deployed to production');
  });

  it('shows full event description by default', async () => {
    const longText =
      'This event description is intentionally very long and should be shown in full by default to avoid hiding important details';

    client.scenario.get('/v3/events', (_req, res) => {
      res.json({
        events: [
          {
            id: 'uev_long',
            createdAt: 1700000000000,
            text: longText,
            type: 'firewall-bypass-created',
            principalId: 'user_1',
            principal: { type: 'user', username: 'jane' },
          },
        ],
      });
    });

    client.setArgv('activity', 'ls');

    const exitCode = await activity(client);

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain(longText);
  });

  it('uses event text as header and type as detail', async () => {
    const longText =
      'This event description is intentionally very long and should be shown fully in the header';

    client.scenario.get('/v3/events', (_req, res) => {
      res.json({
        events: [
          {
            id: 'uev_long',
            createdAt: 1700000000000,
            text: longText,
            type: 'firewall-bypass-created',
            principalId: 'user_1',
            principal: { type: 'user', username: 'jane' },
          },
        ],
      });
    });

    client.setArgv('activity', 'ls');

    const exitCode = await activity(client);

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain(`1. ${longText}`);
    expect(output).toContain('Type: firewall-bypass-created');
    expect(output).toContain('Actor: jane');
  });

  it('supports repeatable and comma-separated --type filters', async () => {
    let requestQuery: any;
    client.scenario.get('/v3/events', (req, res) => {
      requestQuery = req.query;
      res.json({ events: [] });
    });

    client.setArgv(
      'activity',
      'ls',
      '--type',
      'deployment,project-created',
      '--type',
      'team-member-add'
    );

    const exitCode = await activity(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.types).toBe(
      'deployment,project-created,team-member-add'
    );
  });

  it('passes ISO date filters through as ISO strings', async () => {
    let requestQuery: any;
    client.scenario.get('/v3/events', (req, res) => {
      requestQuery = req.query;
      res.json({ events: [] });
    });

    client.setArgv(
      'activity',
      'ls',
      '--since',
      '2025-01-01T00:00:00Z',
      '--until',
      '2025-01-02T00:00:00Z'
    );

    const exitCode = await activity(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.since).toBe('2025-01-01T00:00:00.000Z');
    expect(requestQuery.until).toBe('2025-01-02T00:00:00.000Z');
  });

  it('resolves --project to projectId and skips linked project lookup', async () => {
    let requestQuery: any;
    client.scenario.get('/v9/projects/:projectNameOrId', (_req, res) => {
      res.json({
        id: 'prj_overridden',
        name: 'my-app',
        accountId: 'team_dummy',
        updatedAt: Date.now(),
        createdAt: Date.now(),
      });
    });
    client.scenario.get('/v3/events', (req, res) => {
      requestQuery = req.query;
      res.json({ events: [] });
    });

    client.setArgv('activity', 'ls', '--project', 'my-app');

    const exitCode = await activity(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.projectIds).toBe('prj_overridden');
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  it('returns project lookup API errors when resolving --project', async () => {
    client.scenario.get('/v9/projects/:projectNameOrId', (_req, res) => {
      res.status(403).json({
        error: {
          code: 'forbidden',
          message: 'Project access denied.',
        },
      });
    });

    client.setArgv('activity', 'ls', '--project', 'my-app');

    const exitCode = await activity(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Project access denied.');
  });

  it('returns project lookup API errors as JSON with --format=json', async () => {
    client.scenario.get('/v9/projects/:projectNameOrId', (_req, res) => {
      res.status(403).json({
        error: {
          code: 'forbidden',
          message: 'Project access denied.',
        },
      });
    });

    client.setArgv('activity', 'ls', '--project', 'my-app', '--format=json');

    const exitCode = await activity(client);

    expect(exitCode).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: {
        code: 'forbidden',
        message: 'Project access denied.',
      },
    });
  });

  it('uses team-wide scope for --all', async () => {
    let requestQuery: any;
    client.scenario.get('/v3/events', (req, res) => {
      requestQuery = req.query;
      res.json({ events: [] });
    });

    client.setArgv('activity', 'ls', '--all');

    const exitCode = await activity(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.teamId).toBe('team_dummy');
    expect(requestQuery.projectIds).toBeUndefined();
    expect(mockedGetLinkedProject).not.toHaveBeenCalled();
  });

  it('errors when both --all and --project are specified', async () => {
    client.setArgv('activity', 'ls', '--all', '--project', 'my-app');

    const exitCode = await activity(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Cannot specify both --all and --project'
    );
  });

  it('shows next-page hint for paginated responses', async () => {
    let requestQuery: any;
    client.scenario.get('/v3/events', (req, res) => {
      requestQuery = req.query;
      res.json({
        events: [
          {
            id: 'uev_1',
            createdAt: 3000,
            text: 'Event 1',
            type: 'deployment',
            principalId: 'user_1',
          },
          {
            id: 'uev_2',
            createdAt: 2000,
            text: 'Event 2',
            type: 'deployment',
            principalId: 'user_1',
          },
          {
            id: 'uev_3',
            createdAt: 1000,
            text: 'Event 3',
            type: 'deployment',
            principalId: 'user_1',
          },
        ],
      });
    });

    client.setArgv('activity', 'ls', '--limit', '2');

    const exitCode = await activity(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.limit).toBe('3');
    expect(client.stderr.getFullOutput()).toContain('To display the next page');
    expect(client.stderr.getFullOutput()).toContain('--next 1999');
  });

  it('returns JSON payload with pagination metadata', async () => {
    let requestQuery: any;
    client.scenario.get('/v3/events', (req, res) => {
      requestQuery = req.query;
      res.json({
        events: [
          {
            id: 'uev_1',
            createdAt: 3000,
            text: 'Event 1',
            type: 'deployment',
            principalId: 'user_1',
            payload: { ip: '127.0.0.1' },
          },
          {
            id: 'uev_2',
            createdAt: 2000,
            text: 'Event 2',
            type: 'deployment',
            principalId: 'user_1',
            payload: { ip: '127.0.0.2' },
          },
        ],
      });
    });

    client.setArgv('activity', 'ls', '--format=json', '--limit', '1');

    const exitCode = await activity(client);

    expect(exitCode).toBe(0);
    expect(requestQuery.withPayload).toBe('true');

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed).toEqual({
      events: [
        {
          id: 'uev_1',
          createdAt: 3000,
          text: 'Event 1',
          type: 'deployment',
          principalId: 'user_1',
          payload: { ip: '127.0.0.1' },
        },
      ],
      pagination: { next: 2999 },
    });
  });

  it('returns guidance when no linked project exists', async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'not_linked',
      org: null as any,
      project: null as any,
    });

    client.setArgv('activity', 'ls');

    const exitCode = await activity(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No linked project found');
  });

  it('returns permission guidance for 403 errors', async () => {
    client.scenario.get('/v3/events', (_req, res) => {
      res.status(403).json({
        error: {
          code: 'forbidden',
          message: 'forbidden',
        },
      });
    });

    client.setArgv('activity', 'ls');

    const exitCode = await activity(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'You do not have permission to list activity events'
    );
  });

  it('works in non-TTY mode', async () => {
    client.stdout.isTTY = false;
    client.scenario.get('/v3/events', (_req, res) => {
      res.json({ events: [] });
    });

    client.setArgv('activity', 'ls');

    const exitCode = await activity(client);

    expect(exitCode).toBe(0);
  });
});
