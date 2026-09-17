import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

const source = 'example.com';
const destination = 'www.example.com';
const project = 'my-project';
const domainPath = `/v9/projects/${project}/domains`;
const response = {
  name: source,
  apexName: source,
  projectId: 'prj_123',
  verified: true,
  redirect: destination,
  redirectStatusCode: 307,
};
function argv(...extra: string[]) {
  client.setArgv(
    'domains',
    'add',
    source,
    project,
    '--redirect',
    destination,
    ...extra
  );
}
function reads(existing: Record<string, unknown> | null = null) {
  useUser();
  client.scenario.get(`${domainPath}/${destination}`, (_req, res) =>
    res.json({ ...response, name: destination, redirect: null })
  );
  client.scenario.get(`${domainPath}/${source}`, (_req, res) =>
    existing
      ? res.json({ ...response, redirect: null, ...existing })
      : res
          .status(404)
          .json({ error: { code: 'not_found', message: 'Domain not found' } })
  );
}

afterEach(() => {
  client.nonInteractive = false;
  vi.restoreAllMocks();
});

describe('domains add --redirect', () => {
  it.each([
    '301',
    '302',
    '307',
    '308',
  ])('creates a redirect atomically with status %s', async code => {
    reads();
    argv('--redirect-status-code', code);
    const mutate = vi.fn((req, res) => {
      expect(req.body).toEqual({
        name: source,
        redirect: destination,
        redirectStatusCode: Number(code),
      });
      res.json({ ...response, redirectStatusCode: Number(code) });
    });
    client.scenario.post(`/v10/projects/${project}/domains`, mutate);
    expect(await domains(client)).toBe(0);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(client.stderr.getFullOutput()).toContain(
      `${source} → ${destination} (${code})`
    );
    expect(client.stderr.getFullOutput()).not.toContain(
      'automatically get assigned'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:add', value: 'add' },
      { key: 'option:redirect', value: '[REDACTED]' },
      { key: 'option:redirect-status-code', value: '[REDACTED]' },
      { key: 'argument:domain', value: '[REDACTED]' },
      { key: 'argument:project', value: '[REDACTED]' },
    ]);
  });

  it('defaults to a temporary 307 redirect', async () => {
    reads();
    argv();
    client.scenario.post(`/v10/projects/${project}/domains`, (req, res) => {
      expect(req.body.redirectStatusCode).toBe(307);
      res.json(response);
    });
    expect(await domains(client)).toBe(0);
  });

  it('updates an existing domain without clearing its custom environment', async () => {
    reads({ customEnvironmentId: 'env_123', gitBranch: null });
    argv();
    client.scenario.patch(`${domainPath}/${source}`, (req, res) => {
      expect(req.body).toEqual({
        gitBranch: null,
        customEnvironmentId: 'env_123',
        redirect: destination,
        redirectStatusCode: 307,
      });
      res.json(response);
    });
    expect(await domains(client)).toBe(0);
  });

  it('reports an existing identical redirect without mutating it', async () => {
    reads(response);
    argv();
    const fetch = vi.spyOn(client, 'fetch');
    expect(await domains(client)).toBe(0);
    expect(
      fetch.mock.calls.filter(
        ([, opts]) => opts?.method === 'PATCH' || opts?.method === 'POST'
      )
    ).toEqual([]);
    expect(client.stderr.getFullOutput()).toContain('already configured');
  });

  it('does not clear a Preview branch to configure a redirect', async () => {
    reads({ gitBranch: 'preview' });
    argv();
    const fetch = vi.spyOn(client, 'fetch');
    expect(await domains(client)).toBe(1);
    expect(
      fetch.mock.calls.filter(
        ([, opts]) => opts?.method === 'PATCH' || opts?.method === 'POST'
      )
    ).toEqual([]);
    expect(client.stderr.getFullOutput()).toContain(
      'assigned to a Preview branch'
    );
  });

  it.each([
    [source, '--redirect', destination],
    [source, project, '--redirect-status-code', '308'],
    [source, project, '--redirect', ''],
    [source, project, '--redirect', destination, '--force'],
    [
      source,
      project,
      '--redirect',
      destination,
      '--redirect-status-code',
      '303',
    ],
    [
      source,
      project,
      '--redirect',
      destination,
      '--redirect-status-code',
      '3e2',
    ],
    [
      source,
      project,
      '--redirect',
      destination,
      '--redirect-status-code',
      '0307',
    ],
    [source, project, '--redirect', 'EXAMPLE.COM'],
    [source, project, '--redirect', 'https://www.example.com'],
    [source, project, '--redirect', 'www.example.com/path'],
    [source, project, '--redirect', 'www.example.com?x=y'],
    [source, project, '--redirect', 'www.example.com#fragment'],
    [source, project, '--redirect', 'www.example.com:443'],
    [source, project, '--redirect', 'www.example.com\n'],
    [source, project, '--redirect', '*.example.com'],
    [source, project, '--redirect', '127.0.0.1'],
    [source, project, '--redirect', '-invalid.example.com'],
    ['example.com/path', project, '--redirect', destination],
    [source, 'project?teamId=other', '--redirect', destination],
  ])('rejects invalid input before remote requests: %j', async (...args) => {
    client.setArgv('domains', 'add', ...args);
    const fetch = vi.spyOn(client, 'fetch');
    expect(await domains(client)).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('normalizes Unicode and uppercase domains', async () => {
    useUser();
    client.setArgv(
      'domains',
      'add',
      'Bu\u0308cher.DE',
      project,
      '--redirect',
      'WWW.BÜCHER.DE'
    );
    client.scenario.get(`${domainPath}/www.xn--bcher-kva.de`, (_req, res) =>
      res.json({ ...response, name: 'www.xn--bcher-kva.de', redirect: null })
    );
    client.scenario.get(`${domainPath}/xn--bcher-kva.de`, (_req, res) =>
      res.status(404).json({ error: { code: 'not_found' } })
    );
    client.scenario.post(`/v10/projects/${project}/domains`, (req, res) => {
      expect(req.body.name).toBe('xn--bcher-kva.de');
      expect(req.body.redirect).toBe('www.xn--bcher-kva.de');
      res.json({ ...response, ...req.body });
    });
    expect(await domains(client)).toBe(0);
  });

  it.each([
    404, 403,
  ])('does not mutate when the destination is unavailable (%i)', async status => {
    useUser();
    argv();
    client.scenario.get(`${domainPath}/${destination}`, (_req, res) =>
      res.status(status).json({
        error: {
          code: status === 403 ? 'forbidden' : 'not_found',
          message: 'Destination unavailable',
        },
      })
    );
    const fetch = vi.spyOn(client, 'fetch');
    expect(await domains(client)).toBe(1);
    expect(
      fetch.mock.calls.filter(
        ([, opts]) => opts?.method === 'PATCH' || opts?.method === 'POST'
      )
    ).toEqual([]);
  });

  it('rejects redirect chains before creating the source domain', async () => {
    useUser();
    argv();
    client.scenario.get(`${domainPath}/${destination}`, (_req, res) =>
      res.json({
        ...response,
        name: destination,
        redirect: 'other.example.com',
      })
    );
    const fetch = vi.spyOn(client, 'fetch');
    expect(await domains(client)).toBe(1);
    expect(
      fetch.mock.calls.filter(
        ([, opts]) => opts?.method === 'PATCH' || opts?.method === 'POST'
      )
    ).toEqual([]);
    expect(client.stderr.getFullOutput()).toContain(
      'Redirect chains are not supported'
    );
  });

  it.each([
    403, 429, 500,
  ])('does not retry failed mutations (%i)', async status => {
    reads();
    argv();
    const mutate = vi.fn((_req, res) => {
      res.setHeader('Retry-After', '1');
      res
        .status(status)
        .json({ error: { code: 'request_failed', message: 'Request failed' } });
    });
    client.scenario.post(`/v10/projects/${project}/domains`, mutate);
    expect(await domains(client)).toBe(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(client.stderr.getFullOutput()).not.toContain('Configured');
  });

  it('returns an error when the response does not confirm the redirect', async () => {
    reads();
    argv();
    client.scenario.post(`/v10/projects/${project}/domains`, (_req, res) =>
      res.json({ ...response, redirect: null })
    );
    expect(await domains(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Inspect the domain before retrying'
    );
  });

  it('emits clean non-interactive JSON with DNS/verification follow-up', async () => {
    reads();
    argv('--non-interactive');
    client.nonInteractive = true;
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    client.scenario.post(`/v10/projects/${project}/domains`, (_req, res) =>
      res.json({ ...response, verified: false })
    );
    expect(await domains(client)).toBe(0);
    const data = JSON.parse(client.stdout.getFullOutput());
    expect(data).toMatchObject({
      status: 'success',
      reason: 'redirect_configured',
    });
    expect(data.next[0].command).toContain(
      `domains verify ${source} --project ${project}`
    );
    expect(data.message).toContain('verification is still required');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('emits structured validation errors without prompting or network access', async () => {
    client.nonInteractive = true;
    argv('--redirect-status-code', '401');
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    const fetch = vi.spyOn(client, 'fetch');
    expect(await domains(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
    expect(exit).toHaveBeenCalledWith(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the linked team for both lookup and mutation', async () => {
    useUser();
    useTeam('team_stale');
    useTeam('team_linked');
    client.cwd = setupTmpDir();
    await outputFile(
      join(client.cwd, '.vercel', 'project.json'),
      JSON.stringify({ projectId: 'prj_linked', orgId: 'team_linked' })
    );
    client.config.currentTeam = 'team_stale';
    argv();
    client.scenario.get(`${domainPath}/${destination}`, (req, res) => {
      expect(req.query.teamId).toBe('team_linked');
      res.json({ ...response, name: destination, redirect: null });
    });
    client.scenario.get(`${domainPath}/${source}`, (_req, res) =>
      res.status(404).json({ error: { code: 'not_found' } })
    );
    client.scenario.post(`/v10/projects/${project}/domains`, (req, res) => {
      expect(req.query.teamId).toBe('team_linked');
      res.json(response);
    });
    expect(await domains(client)).toBe(0);
  });
});
