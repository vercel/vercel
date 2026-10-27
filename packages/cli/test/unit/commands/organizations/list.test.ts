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

describe('organizations list', () => {
  it.each([
    { tty: true, flags: ['--format', 'json'] },
    { tty: true, flags: ['-F', 'json'] },
    { tty: true, flags: ['--json'] },
    { tty: false, flags: ['--format', 'json'] },
  ])('prints the keyed result for %j', async mode => {
    client.stdin.isTTY = mode.tty;
    client.nonInteractive = false;
    client.scenario.get('/v1/organizations', (_req, res) =>
      res.json({ organizations: [org] })
    );
    expect(await run('list', ...mode.flags)).toBe(0);
    expect(jsonOutput()).toEqual({
      organizations: [org],
      pagination: { next: null },
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  // Format and interaction are separate settings: only --json selects JSON.
  it.each([
    { nonInteractive: true, flags: [] },
    { nonInteractive: false, flags: ['--non-interactive'] },
  ])('prints the human table for a non-interactive run %j', async mode => {
    client.stdin.isTTY = false;
    client.nonInteractive = mode.nonInteractive;
    client.scenario.get('/v1/organizations', (_req, res) =>
      res.json({ organizations: [org] })
    );
    expect(await run('list', ...mode.flags)).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain(org.organizationId);
    expect(() => JSON.parse(stdout)).toThrow();
  });

  it('prints JSON for a non-interactive run with --json', async () => {
    client.stdin.isTTY = false;
    client.nonInteractive = true;
    client.scenario.get('/v1/organizations', (_req, res) =>
      res.json({ organizations: [org] })
    );
    expect(await run('list', '--json')).toBe(0);
    expect(jsonOutput()).toEqual({
      organizations: [org],
      pagination: { next: null },
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each([
    'list',
    'ls',
  ])('lists organizations with %s independently of the active team', async action => {
    client.config.currentTeam = 'team_unrelated';
    client.scenario.get('/v1/organizations', (req, res) => {
      expect(req.query).toEqual({});
      expect(req.headers.authorization).toBe('Bearer token_dummy');
      res.json({ organizations: [{ ...org, avatar: null }] });
    });
    expect(await run(action, '--format', 'json')).toBe(0);
    // Fields outside the schema pass through, as the CLI design system
    // requires for JSON output.
    expect(jsonOutput()).toEqual({
      organizations: [{ ...org, avatar: null }],
      pagination: { next: null },
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each([
    'json',
    'JSON',
  ])('outputs JSON for -F %s outside agent mode', async format => {
    client.nonInteractive = false;
    client.scenario.get('/v1/organizations', (_req, res) =>
      res.json({ organizations: [org] })
    );
    expect(await run('list', '-F', format)).toBe(0);
    expect(jsonOutput()).toEqual({
      organizations: [org],
      pagination: { next: null },
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('rejects an unsupported output format', async () => {
    expect(await run('list', '--format', 'yaml')).toBe(2);
    expect(client.stderr.getFullOutput()).toContain('Invalid output format');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('reports API failures as agent errors', async () => {
    client.nonInteractive = true;
    client.scenario.get('/v1/organizations', (_req, res) =>
      res
        .status(403)
        .json({ error: { code: 'forbidden', message: 'Forbidden' } })
    );
    expect(await runExpectingAgentExit('list')).toMatchObject({
      status: 'error',
      reason: 'permission_denied',
      message: "You can't list organizations.",
      data: { remoteMessage: 'Forbidden' },
    });
  });

  it('prints API failures on stderr outside agent mode', async () => {
    client.nonInteractive = false;
    client.scenario.get('/v1/organizations', (_req, res) =>
      res
        .status(403)
        .json({ error: { code: 'forbidden', message: 'Forbidden' } })
    );
    expect(await run('list', '-F', 'json')).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "You can't list organizations."
    );
    expect(client.stderr.getFullOutput()).toContain('Vercel API: Forbidden');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  // The table is the result, so it pipes. Status and spinners stay on stderr.
  it('prints the human table on stdout', async () => {
    client.scenario.get('/v1/organizations', (_req, res) =>
      res.json({ organizations: [org] })
    );
    expect(await run('list', '--no-color')).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain(org.organizationId);
    expect(stdout).toContain(org.slug);
    expect(stdout).toContain(org.teamId);
    expect(stdout).not.toContain('\u001b');
    expect(client.stderr.getFullOutput()).not.toContain(org.organizationId);
  });

  it.each([
    false,
    true,
  ])('handles empty organization lists (json: %s)', async json => {
    client.scenario.get('/v1/organizations', (_req, res) =>
      res.json({ organizations: [] })
    );
    expect(await run('list', ...(json ? ['--format', 'json'] : []))).toBe(0);
    if (json)
      expect(jsonOutput()).toEqual({
        organizations: [],
        pagination: { next: null },
      });
    else expect(client.stderr.getFullOutput()).toContain('No organizations.');
  });

  it('rejects positional arguments', async () => {
    client.nonInteractive = true;
    expect(await runExpectingAgentExit('list', 'org_abc123')).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
  });

  it('never prompts in a non-interactive run', async () => {
    client.nonInteractive = true;
    const prompt = vi.spyOn(client.input, 'text');
    client.scenario.get('/v1/organizations', (_req, res) =>
      res.json({ organizations: [org] })
    );
    expect(await run('list')).toBe(0);
    expect(client.stdout.getFullOutput()).toContain(org.organizationId);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('rejects malformed API data without printing the raw response', async () => {
    client.nonInteractive = true;
    client.scenario.get('/v1/organizations', (_req, res) =>
      res.json({ organizations: [{ private: 'do-not-print' }] })
    );
    expect(await runExpectingAgentExit('list')).toMatchObject({
      status: 'error',
      reason: 'api_error',
      message:
        'Failed to list organizations. The Organizations API returned an invalid response at organizations.0.organizationId, organizations.0.slug, organizations.0.teamId, organizations.0.teamCount, organizations.0.createdAt.',
    });
    expect(client.getFullOutput()).not.toContain('do-not-print');
  });

  it.each([
    { data: null, path: '<root>' },
    {
      data: { organizations: [{ ...org, teamCount: 'private-value' }] },
      path: 'organizations.0.teamCount',
    },
  ])('reports the failing response path $path', async ({ data, path }) => {
    client.nonInteractive = true;
    client.scenario.get('/v1/organizations', (_req, res) => res.json(data));
    expect(await runExpectingAgentExit('list')).toMatchObject({
      status: 'error',
      reason: 'api_error',
      message: `Failed to list organizations. The Organizations API returned an invalid response at ${path}.`,
    });
    expect(client.getFullOutput()).not.toContain('private-value');
  });

  it('pages the list with --limit and --next', async () => {
    const orgs = ['a', 'b', 'c'].map(slug => ({
      ...org,
      organizationId: `org_${slug}`,
      slug,
    }));
    client.scenario.get('/v1/organizations', (_req, res) =>
      res.json({ organizations: orgs })
    );
    expect(await run('list', '--limit', '2', '--format', 'json')).toBe(0);
    const first = jsonOutput();
    expect(first.organizations).toEqual(orgs.slice(0, 2));
    expect(first.pagination.next).toEqual(expect.any(String));

    const firstLength = client.stdout.getFullOutput().length;
    expect(
      await run(
        'list',
        '--limit',
        '2',
        '--next',
        first.pagination.next,
        '--format',
        'json'
      )
    ).toBe(0);
    expect(
      JSON.parse(client.stdout.getFullOutput().slice(firstLength))
    ).toEqual({ organizations: [orgs[2]], pagination: { next: null } });
  });

  it('rejects a cursor that is not from this list before requests', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(
      await runExpectingAgentExit('list', '--next', 'nope', '--non-interactive')
    ).toMatchObject({ status: 'error', reason: 'invalid_arguments' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
