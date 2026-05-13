import { beforeEach, describe, expect, it, vi } from 'vitest';
import open from 'open';
import connect from '../../../../src/commands/connex';
import { client } from '../../../mocks/client';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

vi.mock('open', () => {
  return {
    default: vi.fn(),
  };
});

const openMock = vi.mocked(open);

describe('connex open', () => {
  let team: { id: string; slug: string };

  beforeEach(() => {
    client.reset();
    openMock.mockClear();
    useUser();
    const teams = useTeams();
    team = Array.isArray(teams) ? teams[0] : teams.teams[0];
    client.config.currentTeam = team.id;
  });

  it('should open the client detail page on success', async () => {
    const clientId = 'scl_abc123';
    client.scenario.get(`/v1/connex/clients/${clientId}`, (_req, res) => {
      res.json({ id: clientId, uid: 'slack/my-bot', type: 'slack' });
    });

    client.setArgv('connect', 'open', clientId);

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(openMock).toHaveBeenCalledWith(
      `https://vercel.com/${encodeURIComponent(team.slug)}/~/connex/${clientId}`
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Opening Connect connector scl_abc123'
    );
  });

  it('should resolve a UID to the scl_ id and link to that', async () => {
    const uid = 'slack/my-bot';
    const resolvedId = 'scl_xyz';
    client.scenario.get(
      `/v1/connex/clients/${encodeURIComponent(uid)}`,
      (_req, res) => {
        res.json({ id: resolvedId, uid, type: 'slack' });
      }
    );

    client.setArgv('connect', 'open', uid);

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(openMock).toHaveBeenCalledWith(
      `https://vercel.com/${encodeURIComponent(team.slug)}/~/connex/${resolvedId}`
    );
  });

  it('should show a friendly error when the client is not found (404)', async () => {
    client.scenario.get('/v1/connex/clients/scl_missing', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv('connect', 'open', 'scl_missing');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('not found');
    expect(openMock).not.toHaveBeenCalled();
  });

  it('should error when no argument is passed', async () => {
    client.setArgv('connect', 'open');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing connector ID or UID'
    );
    expect(openMock).not.toHaveBeenCalled();
  });

  it('should output JSON when --format=json is passed', async () => {
    const clientId = 'scl_abc123';
    client.scenario.get(`/v1/connex/clients/${clientId}`, (_req, res) => {
      res.json({ id: clientId, uid: 'slack/my-bot', type: 'slack' });
    });

    client.setArgv('connect', 'open', clientId, '--format=json');

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput().trim();
    const parsed = JSON.parse(stdout);
    expect(parsed.url).toBe(
      `https://vercel.com/${encodeURIComponent(team.slug)}/~/connex/${clientId}`
    );
    expect(openMock).not.toHaveBeenCalled();
  });

  it('should print URL to stdout when stdout is not a TTY', async () => {
    const clientId = 'scl_abc123';
    client.scenario.get(`/v1/connex/clients/${clientId}`, (_req, res) => {
      res.json({ id: clientId, uid: 'slack/my-bot', type: 'slack' });
    });

    (client.stdout as unknown as { isTTY: boolean }).isTTY = false;

    client.setArgv('connect', 'open', clientId);

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput().trim()).toBe(
      `https://vercel.com/${encodeURIComponent(team.slug)}/~/connex/${clientId}`
    );
    expect(openMock).not.toHaveBeenCalled();
  });

  it('should track telemetry for the open subcommand', async () => {
    const clientId = 'scl_abc123';
    client.scenario.get(`/v1/connex/clients/${clientId}`, (_req, res) => {
      res.json({ id: clientId, uid: 'slack/my-bot', type: 'slack' });
    });

    client.setArgv('connect', 'open', clientId);

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:open',
        value: 'open',
      },
    ]);
  });
});
