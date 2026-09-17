import { afterEach, describe, expect, it, vi } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

describe('domains update', () => {
  afterEach(() => {
    client.nonInteractive = false;
    client.stdin.isTTY = true;
  });

  it('documents the supported settings and tracks help', async () => {
    client.setArgv('domains', 'update', '--help');
    expect(await domains(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain('--zone');
    expect(client.stderr.getFullOutput()).toContain('--ech-mode');
    expect(client.stderr.getFullOutput()).not.toContain('--cdn');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'domains:update' },
    ]);
  });

  it.each([
    ['--zone', 'true', { zone: true }],
    ['--zone', 'false', { zone: false }],
    ['--ech-mode', 'auto', { echMode: 'auto' }],
    ['--ech-mode', 'disabled', { echMode: 'disabled' }],
  ])('updates %s %s without sending omitted fields', async (flag, value, body) => {
    useUser();
    let sent: unknown;
    client.scenario.patch('/v3/domains/example.com', (req, res) => {
      sent = req.body;
      res.json({ zone: true, echMode: 'auto', ...body });
    });
    client.setArgv('domains', 'update', 'example.com', flag, value);
    expect(await domains(client)).toBe(0);
    expect(sent).toEqual(body);
    expect(client.stderr.getFullOutput()).toContain(
      'Updated example.com under'
    );
    expect(client.stderr.getFullOutput()).toMatch(/DNS Zone\s+(true|false)/);
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('updates both settings in the selected team and reports server state', async () => {
    useUser();
    const team = useTeam('team_domains');
    client.config.currentTeam = team.id;
    let sent: unknown;
    let teamId: unknown;
    client.scenario.patch('/v3/domains/example.com', (req, res) => {
      sent = req.body;
      teamId = req.query.teamId;
      res.json({ zone: true, echMode: 'disabled' });
    });
    client.setArgv(
      'domains',
      'update',
      'EXAMPLE.COM',
      '--zone',
      'true',
      '--ech-mode',
      'disabled',
      '--json'
    );
    expect(await domains(client)).toBe(0);
    expect(sent).toEqual({ zone: true, echMode: 'disabled' });
    expect(teamId).toBe(team.id);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'ok',
      domain: 'example.com',
      team: team.slug,
      zone: true,
      echMode: 'disabled',
    });
    expect(client.stderr.getFullOutput()).not.toContain('Updating');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:update', value: 'update' },
      { key: 'argument:domain', value: '[REDACTED]' },
      { key: 'option:zone', value: 'true' },
      { key: 'option:ech-mode', value: 'disabled' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it.each([
    'non-interactive',
    'pipe',
    'format',
  ])('emits clean JSON in %s mode without prompting', async mode => {
    useUser();
    if (mode === 'non-interactive') client.nonInteractive = true;
    if (mode === 'pipe') client.stdin.isTTY = false;
    const prompt = vi.spyOn(client.input, 'confirm');
    client.scenario.patch('/v3/domains/example.com', (_req, res) => {
      res.json({ zone: true, echMode: 'enabled' });
    });
    client.setArgv(
      'domains',
      'update',
      'example.com',
      '--zone',
      'true',
      ...(mode === 'format' ? ['--format', 'json'] : [])
    );
    expect(await domains(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'ok',
      echMode: 'enabled',
    });
    expect(prompt).not.toHaveBeenCalled();
    prompt.mockRestore();
  });

  it.each([
    [],
    ['example.com'],
    ['example.com', 'second.com', '--zone', 'true'],
    ['example.com', '--zone', 'yes'],
    ['example.com', '--zone'],
    ['example.com', '--ech-mode', 'enabled'],
    ['example.com', '--cdn', 'true'],
    ['example.com', '--zone', 'false', '--ech-mode', 'auto'],
    ['example.com', '--zone', 'true', '--format', 'xml'],
    ['https://example.com', '--zone', 'true'],
    ['example.com/path', '--zone', 'true'],
    ['example.com?teamId=other', '--zone', 'true'],
    ['example.com%2f..', '--zone', 'true'],
    ['example.com\n', '--zone', 'true'],
    ['sub.example.com', '--zone', 'true'],
    ['-example.com', '--zone', 'true'],
    ['example..com', '--zone', 'true'],
  ])('rejects invalid input %j before remote requests', async (...args) => {
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv('domains', 'update', ...args, '--json');
    expect(await domains(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput()).status).toBe('error');
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it.each([
    'bücher.de',
    'bu\u0308cher.de',
  ])('normalizes the international domain %s for the API path', async input => {
    useUser();
    client.scenario.patch('/v3/domains/xn--bcher-kva.de', (_req, res) => {
      res.json({ zone: false, echMode: 'auto' });
    });
    client.setArgv('domains', 'update', input, '--zone', 'false', '--json');
    expect(await domains(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput()).domain).toBe(
      'xn--bcher-kva.de'
    );
  });

  it.each([
    403, 404, 429, 500,
  ])('returns a %s API error without repeating the mutation', async status => {
    useUser();
    let attempts = 0;
    client.scenario.patch('/v3/domains/example.com', (_req, res) => {
      attempts++;
      if (status === 429) res.set('Retry-After', '60');
      res.status(status).json({
        error: {
          code: 'settings_error',
          message: 'Domain settings could not be changed.',
        },
      });
    });
    client.setArgv(
      'domains',
      'update',
      'example.com',
      '--zone',
      'true',
      '--json'
    );
    expect(await domains(client)).toBe(1);
    expect(attempts).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'settings_error',
    });
    expect(client.stderr.getFullOutput()).not.toContain('Updated');
  });
});
