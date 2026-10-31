import { describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import {
  org,
  run,
  runExpectingAgentExit,
  jsonOutput,
  setupOrganizationsTest,
} from './helpers';

setupOrganizationsTest();

describe('organizations create', () => {
  it('rejects an explicitly empty optional name before creating an organization', async () => {
    client.config.currentTeam = org.teamId;
    const fetch = vi.spyOn(client, 'fetch');
    expect(
      await runExpectingAgentExit(
        'create',
        '--slug',
        'acme',
        '--name',
        '',
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates using the active team as the root team and redacts telemetry', async () => {
    client.config.currentTeam = org.teamId;
    const fetch = vi.spyOn(client, 'fetch');
    client.scenario.post('/v1/organizations', (req, res) => {
      expect(req.query).toEqual({ teamId: org.teamId });
      expect(req.body).toEqual({ slug: org.slug, name: org.name });
      res.json(org);
    });
    expect(
      await run(
        'create',
        '--slug',
        org.slug,
        '--name',
        org.name,
        '--format',
        'json'
      )
    ).toBe(0);
    expect(jsonOutput()).toEqual({ organization: org, outcome: 'created' });
    expect(fetch).toHaveBeenCalledWith(
      `/v1/organizations?teamId=${org.teamId}`,
      expect.objectContaining({
        retry: { retries: 0 },
        bailOn429: true,
        useCurrentTeam: false,
      })
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:create', value: 'create' },
      { key: 'option:format', value: 'json' },
      { key: 'option:slug', value: '[REDACTED]' },
      { key: 'option:name', value: '[REDACTED]' },
    ]);
  });

  it('omits an unspecified name on creation', async () => {
    client.scenario.post('/v1/organizations', (req, res) => {
      expect(req.body).toEqual({ slug: 'acme' });
      res.json(org);
    });
    client.config.currentTeam = org.teamId;
    expect(await run('create', '--slug', 'acme')).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('✓ Created');
  });

  it.each([
    [500, 'api_error'],
    [429, 'rate_limited'],
  ])('does not retry a failed create (%s)', async (status, reason) => {
    client.config.currentTeam = org.teamId;
    let calls = 0;
    client.scenario.post('/v1/organizations', (_req, res) => {
      calls++;
      res.setHeader('retry-after', '0');
      res
        .status(status)
        .json({ error: { code: 'failed', message: 'Creation failed' } });
    });
    expect(
      await runExpectingAgentExit(
        'create',
        '--slug',
        'acme',
        '--non-interactive'
      )
    ).toMatchObject({ status: 'error', reason });
    expect(calls).toBe(1);
  });
});
