import { describe, expect, it } from 'vitest';
import drains from '../../../../src/commands/drains';
import { handleUnexpectedError } from '../../../../src/commands/drains/shared';
import { client } from '../../../mocks/client';
import { useTeam } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

const logsDrain = {
  id: 'drn_logs',
  name: 'acme-logs',
  ownerId: 'team_acme',
  createdAt: Date.now() - 60 * 60 * 1000,
  updatedAt: Date.now(),
  schemas: { log: { version: 'v1' } },
  delivery: {
    type: 'http',
    endpoint: 'https://example.com/drain',
    encoding: 'json',
    headers: { Authorization: 'Bearer secret-token' },
    secret: 'signing-secret',
  },
  status: 'enabled',
  source: { kind: 'self-served' },
};

const tracesDrain = {
  ...logsDrain,
  id: 'drn_traces',
  name: 'acme-traces',
  projectIds: ['prj_web'],
  schemas: { trace: { version: 'v1' } },
  delivery: {
    type: 'otlphttp',
    endpoint: { traces: 'https://example.com/v1/traces' },
    encoding: 'proto',
    headers: {},
  },
};

const pausedDrain = {
  ...logsDrain,
  id: 'drn_paused',
  name: 'acme-paused',
  status: 'disabled',
  disabledReason: 'disabled-by-owner',
};

function run(...args: string[]) {
  client.setArgv('drains', ...args);
  return drains(client);
}

function stdoutJson() {
  return JSON.parse(client.stdout.getFullOutput());
}

function stderrJson() {
  const lines = client.stderr.getFullOutput().trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

describe('drains', () => {
  it('rejects an unknown subcommand', async () => {
    expect(await run('frobnicate')).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Unknown command frobnicate'
    );
  });

  it('tracks the subcommand and redacts option values', async () => {
    client.scenario.get('/v9/projects/:name', (req, res) =>
      res.json({ id: 'prj_web', name: req.params.name })
    );
    client.scenario.get('/v1/drains', (_req, res) => res.json({ drains: [] }));
    expect(await run('ls', '--project', 'acme-web', '--json')).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:list', value: 'ls' },
      { key: 'option:project', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  describe('list', () => {
    it('shows a Status column when the API returns delivery stats', async () => {
      client.scenario.get('/v1/drains', (req, res) => {
        expect(req.query.includeDeliveryStats).toBe('true');
        res.json({
          drains: [
            {
              ...logsDrain,
              deliveryStats: {
                state: 'healthy',
                failures: 1,
                attempts: 2000,
                window: '24h',
              },
            },
            {
              ...tracesDrain,
              deliveryStats: {
                state: 'failing',
                failures: 30,
                attempts: 1000,
                window: '24h',
              },
            },
            {
              ...pausedDrain,
              deliveryStats: {
                state: 'unknown',
                failures: 0,
                attempts: 0,
                window: '24h',
              },
            },
            {
              ...logsDrain,
              id: 'drn_quiet',
              deliveryStats: {
                state: 'unknown',
                failures: 0,
                attempts: 0,
                window: '24h',
              },
            },
          ],
        });
      });

      expect(await run()).toBe(0);
      const stdout = client.stdout.getFullOutput();
      expect(stdout).toContain('Status');
      expect(stdout).toContain('Healthy, >99.9% delivered');
      expect(stdout).toContain('Degraded, 97% delivered');
      expect(stdout).toContain('Paused');
      expect(stdout).toContain('No data');
      expect(stdout).toContain('https://example.com/v1/traces');
      expect(stdout).not.toContain('secret-token');
    });

    it('hides the Status column when the API returns no delivery stats', async () => {
      client.scenario.get('/v1/drains', (_req, res) =>
        res.json({ drains: [logsDrain, pausedDrain] })
      );
      expect(await run('list')).toBe(0);
      const stdout = client.stdout.getFullOutput();
      expect(stdout).toContain('drn_logs');
      expect(stdout).not.toContain('Status');
      expect(stdout).not.toContain('No data');
    });

    it('lists drains without stats when the stats query fails', async () => {
      const queries: unknown[] = [];
      client.scenario.get('/v1/drains', (req, res) => {
        queries.push(req.query.includeDeliveryStats);
        if (req.query.includeDeliveryStats) {
          return res.status(503).json({
            error: {
              code: 'delivery_stats_unavailable',
              message: 'Delivery stats are unavailable',
            },
          });
        }
        res.json({ drains: [logsDrain] });
      });

      expect(await run('list')).toBe(0);
      expect(queries).toEqual(['true', undefined]);
      expect(client.stdout.getFullOutput()).toContain('drn_logs');
      expect(client.stdout.getFullOutput()).not.toContain('Status');
      expect(client.stderr.getFullOutput()).toContain(
        'Delivery status is unavailable right now.'
      );
    });

    it('prints tab-separated rows on a non-TTY stdout', async () => {
      client.stdout.isTTY = false;
      client.scenario.get('/v1/drains', (_req, res) =>
        res.json({ drains: [logsDrain] })
      );
      expect(await run('list')).toBe(0);
      const [header, row] = client.stdout.getFullOutput().trim().split('\n');
      expect(header).toBe('ID\tName\tType\tURL\tProjects\tAge');
      expect(row.split('\t').slice(0, 5)).toEqual([
        'drn_logs',
        'acme-logs',
        'Logs',
        'https://example.com/drain',
        'All',
      ]);
    });

    it('prints redacted JSON and filters by project', async () => {
      client.scenario.get('/v9/projects/:name', (req, res) =>
        res.json({ id: 'prj_web', name: req.params.name })
      );
      client.scenario.get('/v1/drains', (req, res) => {
        expect(req.query.projectId).toBe('acme-web');
        res.json({ drains: [logsDrain] });
      });
      expect(await run('list', '--project', 'acme-web', '--json')).toBe(0);
      const json = stdoutJson();
      expect(json.pagination).toEqual({ next: null });
      expect(json.drains[0].delivery).toEqual({
        type: 'http',
        endpoint: 'https://example.com/drain',
        encoding: 'json',
        headers: { Authorization: '[REDACTED]' },
      });
      expect(client.stdout.getFullOutput()).not.toContain('signing-secret');
      expect(client.stderr.getFullOutput()).toBe('');
    });

    it('reports a project that does not exist', async () => {
      client.scenario.get('/v9/projects/:name', (_req, res) =>
        res.status(404).json({ error: { code: 'not_found', message: 'nope' } })
      );
      expect(await run('list', '--project', 'acme-wbe', '--json')).toBe(1);
      expect(stderrJson()).toMatchObject({
        reason: 'project_not_found',
        message: "Couldn't find project acme-wbe.",
      });
    });

    it('reports a failed project lookup as an API error', async () => {
      let drainsRequested = false;
      client.scenario.get('/v9/projects/:name', (_req, res) =>
        res
          .status(403)
          .json({ error: { code: 'forbidden', message: 'Not authorized' } })
      );
      client.scenario.get('/v1/drains', (_req, res) => {
        drainsRequested = true;
        res.json({ drains: [] });
      });
      expect(await run('list', '--project', 'acme-web', '--json')).toBe(1);
      expect(stderrJson()).toMatchObject({
        reason: 'permission_denied',
        message: "You can't list drains.",
        data: { remoteMessage: 'Not authorized' },
      });
      expect(drainsRequested).toBe(false);
    });

    it('pages with --limit and --next', async () => {
      client.scenario.get('/v1/drains', (_req, res) =>
        res.json({ drains: [logsDrain, tracesDrain, pausedDrain] })
      );
      expect(await run('list', '--limit', '2', '--json')).toBe(0);
      const first = stdoutJson();
      expect(first.drains.map((d: { id: string }) => d.id)).toEqual([
        'drn_logs',
        'drn_traces',
      ]);
      expect(first.pagination.next).toEqual(expect.any(String));
    });

    it('continues from a --next cursor', async () => {
      client.scenario.get('/v1/drains', (_req, res) =>
        res.json({ drains: [logsDrain, tracesDrain, pausedDrain] })
      );
      const cursor = Buffer.from(JSON.stringify({ offset: 2 })).toString(
        'base64url'
      );
      expect(await run('list', '--next', cursor, '--json')).toBe(0);
      expect(stdoutJson()).toMatchObject({
        drains: [{ id: 'drn_paused' }],
        pagination: { next: null },
      });
    });

    it('shows the first-use empty state', async () => {
      useUser();
      client.scenario.get('/v1/drains', (_req, res) =>
        res.json({ drains: [] })
      );
      expect(await run('list')).toBe(0);
      expect(client.stderr.getFullOutput()).toContain('No drains in');
      expect(client.stderr.getFullOutput()).toContain(
        'vercel drains create --name <NAME> --type logs --url <URL>'
      );
    });
  });

  describe('inspect', () => {
    it('prints the drain without its secret or header values', async () => {
      client.scenario.get('/v1/drains/drn_logs', (_req, res) =>
        res.json(logsDrain)
      );
      expect(await run('inspect', 'drn_logs')).toBe(0);
      const stdout = client.stdout.getFullOutput();
      expect(stdout).toContain('acme-logs');
      expect(stdout).toContain('Authorization');
      expect(stdout).toMatch(/Signed\s+Yes/);
      expect(stdout).not.toContain('secret-token');
      expect(stdout).not.toContain('signing-secret');
    });

    it('reports a missing drain', async () => {
      client.scenario.get('/v1/drains/drn_nope', (_req, res) =>
        res.status(404).json({ error: { code: 'not_found', message: 'nope' } })
      );
      expect(await run('inspect', 'drn_nope', '--json')).toBe(1);
      expect(stderrJson()).toMatchObject({
        status: 'error',
        reason: 'not_found',
        message: "Couldn't find drain drn_nope.",
      });
    });

    it('requires a drain ID', async () => {
      expect(await run('inspect', '--json')).toBe(2);
      expect(stderrJson()).toMatchObject({ reason: 'missing_arguments' });
    });
  });

  describe('create', () => {
    it('creates a logs drain with filters, projects, and sampling', async () => {
      let body: any;
      client.scenario.get('/v9/projects/:name', (req, res) =>
        res.json({
          id: req.params.name === 'acme-web' ? 'prj_web' : 'prj_api',
          name: req.params.name,
          accountId: 'team_acme',
        })
      );
      client.scenario.post('/v1/drains', (req, res) => {
        body = req.body;
        res.json({ ...logsDrain, projectIds: ['prj_web'] });
      });

      expect(
        await run(
          'create',
          '--name',
          'acme-logs',
          '--type',
          'logs',
          '--url',
          'https://example.com/drain',
          '--encoding',
          'ndjson',
          '--header',
          'Authorization: Bearer secret-token',
          '--secret',
          'signing-secret',
          '--project',
          'acme-web,acme-api',
          '--source',
          'lambda',
          '--source',
          'edge',
          '-e',
          'production',
          '--sample-rate',
          '25',
          '--json'
        )
      ).toBe(0);

      expect(body).toEqual({
        name: 'acme-logs',
        projects: 'some',
        projectIds: ['prj_web', 'prj_api'],
        schemas: { log: { version: 'v1' } },
        delivery: {
          type: 'http',
          endpoint: 'https://example.com/drain',
          encoding: 'ndjson',
          headers: { Authorization: 'Bearer secret-token' },
          secret: 'signing-secret',
        },
        source: { kind: 'self-served' },
        sampling: [{ type: 'head_sampling', rate: 0.25 }],
        filter: {
          version: 'v2',
          filter: {
            type: 'basic',
            log: { sources: ['lambda', 'edge'] },
            deployment: { environments: ['production'] },
          },
        },
      });
      const json = stdoutJson();
      expect(json.outcome).toBe('created');
      expect(json.next[0].command).toBe('vercel drains inspect drn_logs');
      expect(client.stdout.getFullOutput()).not.toContain('secret-token');
    });

    it('creates an unsigned OTLP traces drain for all projects', async () => {
      let body: any;
      client.scenario.post('/v1/drains', (req, res) => {
        body = req.body;
        res.json(tracesDrain);
      });
      expect(
        await run(
          'create',
          '--name',
          'acme-traces',
          '--type',
          'traces',
          '--url',
          'https://example.com/v1/traces'
        )
      ).toBe(0);
      expect(body).toEqual({
        name: 'acme-traces',
        projects: 'all',
        schemas: { trace: { version: 'v1' } },
        delivery: {
          type: 'otlphttp',
          endpoint: { traces: 'https://example.com/v1/traces' },
          encoding: 'json',
          headers: {},
        },
        source: { kind: 'self-served' },
      });
      expect(client.stderr.getFullOutput()).toMatch(/Created\s+acme-traces/);
    });

    it('requires --name, --url, and --type before any request', async () => {
      expect(await run('create', '--name', 'acme', '--json')).toBe(2);
      expect(stderrJson()).toMatchObject({
        reason: 'missing_arguments',
        message: "Can't create a drain without --url, --type.",
      });
    });

    it('reports every invalid option at once', async () => {
      expect(
        await run(
          'create',
          '--name',
          'acme',
          '--type',
          'traces',
          '--url',
          'ftp://example.com',
          '--encoding',
          'ndjson',
          '--source',
          'lambda',
          '--header',
          'not a header',
          '--json'
        )
      ).toBe(2);
      const error = stderrJson();
      expect(error.message).toBe(
        "Can't create the drain. 4 options are invalid."
      );
      expect(
        error.data.issues.map((issue: { field: string }) => issue.field)
      ).toEqual(['url', 'encoding', 'header', 'source']);
    });

    it.each([
      ['audit-log', 'an audit log drain'],
      ['ai-gateway', 'an AI Gateway drain'],
      ['connect', 'a Connect drain'],
    ])('points to the dashboard for --type %s', async (type, label) => {
      useUser();
      const team = useTeam('team_acme');
      // The mock picks a random slug, which can hold characters a URL encodes.
      team.slug = 'acme';
      client.config.currentTeam = team.id;
      expect(await run('create', '--type', type, '--json')).toBe(2);
      const error = stderrJson();
      expect(error).toMatchObject({
        reason: 'invalid_arguments',
        message: `Can't create ${label} with the CLI yet.`,
      });
      expect(error.data.url).toBe('https://vercel.com/acme/~/settings/drains');
    });

    it('shows the dashboard link in human output', async () => {
      useUser();
      expect(
        await run(
          'create',
          '--name',
          'audit',
          '--type',
          'audit-log',
          '--url',
          'https://example.com'
        )
      ).toBe(2);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        "Can't create an audit log drain with the CLI yet."
      );
      expect(stderr).toContain('Create it in the dashboard:');
      expect(stderr).toMatch(/https:\/\/vercel\.com\/.+\/~\/settings\/drains/);
    });

    it('rejects --environment on drains other than logs', async () => {
      expect(
        await run(
          'create',
          '--name',
          'acme-traces',
          '--type',
          'traces',
          '--url',
          'https://example.com/v1/traces',
          '-e',
          'production',
          '--json'
        )
      ).toBe(2);
      expect(stderrJson().data.issues).toEqual([
        expect.objectContaining({ field: 'environment' }),
      ]);
    });

    it('never retries a failed create', async () => {
      let calls = 0;
      client.scenario.post('/v1/drains', (_req, res) => {
        calls++;
        res.status(500).json({ error: { code: 'internal', message: 'boom' } });
      });
      expect(
        await run(
          'create',
          '--name',
          'acme',
          '--type',
          'logs',
          '--url',
          'https://example.com',
          '--json'
        )
      ).toBe(1);
      expect(calls).toBe(1);
      expect(stderrJson()).toMatchObject({ reason: 'unknown_outcome' });
    });
  });

  describe('update', () => {
    it('keeps the stored delivery settings when changing the URL', async () => {
      let body: any;
      client.scenario.get('/v1/drains/drn_logs', (_req, res) =>
        res.json(logsDrain)
      );
      client.scenario.patch('/v1/drains/drn_logs', (req, res) => {
        body = req.body;
        res.json(logsDrain);
      });
      expect(
        await run(
          'update',
          'drn_logs',
          '--url',
          'https://example.com/new',
          '--all',
          '--sample-rate',
          '100',
          '--json'
        )
      ).toBe(0);
      expect(body).toEqual({
        projects: 'all',
        delivery: {
          type: 'http',
          endpoint: 'https://example.com/new',
          encoding: 'json',
          headers: { Authorization: 'Bearer secret-token' },
          secret: 'signing-secret',
        },
        sampling: null,
      });
      expect(stdoutJson().outcome).toBe('updated');
    });

    it('merges sources into the existing filter', async () => {
      let body: any;
      client.scenario.get('/v1/drains/drn_logs', (_req, res) =>
        res.json({
          ...logsDrain,
          filterV2: {
            version: 'v2',
            filter: {
              type: 'basic',
              deployment: { environments: ['production'] },
            },
          },
        })
      );
      client.scenario.patch('/v1/drains/drn_logs', (req, res) => {
        body = req.body;
        res.json(logsDrain);
      });
      expect(await run('update', 'drn_logs', '--source', 'build')).toBe(0);
      expect(body).toEqual({
        filter: {
          version: 'v2',
          filter: {
            type: 'basic',
            deployment: { environments: ['production'] },
            log: { sources: ['build'] },
          },
        },
      });
    });

    it.each([
      { version: 'v2', filter: { type: 'odata', text: "source eq 'lambda'" } },
      { version: 'v3', filter: { type: 'basic' } },
      {
        version: 'v2',
        filter: {
          type: 'basic',
          deployment: {},
          log: { legacy_excludeCachedStaticAssetLogs: true },
        },
      },
    ])('refuses to replace a filter it does not understand: %j', async filterV2 => {
      client.scenario.get('/v1/drains/drn_logs', (_req, res) =>
        res.json({ ...logsDrain, filterV2 })
      );
      expect(
        await run('update', 'drn_logs', '-e', 'production', '--json')
      ).toBe(2);
      expect(stderrJson().data.issues[0].field).toBe('environment');
    });

    it('names the legacy setting on a migrated filter', async () => {
      client.scenario.get('/v1/drains/drn_logs', (_req, res) =>
        res.json({
          ...logsDrain,
          filterV2: {
            version: 'v2',
            filter: {
              type: 'basic',
              log: { legacy_excludeCachedStaticAssetLogs: true },
            },
          },
        })
      );
      expect(
        await run('update', 'drn_logs', '--source', 'lambda', '--json')
      ).toBe(2);
      expect(stderrJson().data.issues[0].message).toContain('legacy setting');
    });

    it('rejects --environment on a traces drain', async () => {
      client.scenario.get('/v1/drains/drn_traces', (_req, res) =>
        res.json(tracesDrain)
      );
      expect(
        await run('update', 'drn_traces', '-e', 'production', '--json')
      ).toBe(2);
      expect(stderrJson().data.issues[0].field).toBe('environment');
    });

    describe('integration drains', () => {
      const integrationDrain = {
        ...logsDrain,
        id: 'drn_integration',
        delivery: {
          ...logsDrain.delivery,
          secret: { kind: 'INTEGRATION_SECRET' },
        },
        source: {
          kind: 'integration',
          integrationId: 'oac_1',
          integrationConfigurationId: 'icfg_1',
        },
      };

      it('refuses delivery changes before any PATCH', async () => {
        client.scenario.get('/v1/drains/drn_integration', (_req, res) =>
          res.json(integrationDrain)
        );
        expect(
          await run('update', 'drn_integration', '--secret', 'mine', '--json')
        ).toBe(2);
        expect(stderrJson().data.issues[0].message).toContain('integration');
      });

      it('still renames them', async () => {
        let body: any;
        client.scenario.get('/v1/drains/drn_integration', (_req, res) =>
          res.json(integrationDrain)
        );
        client.scenario.patch('/v1/drains/drn_integration', (req, res) => {
          body = req.body;
          res.json({ ...integrationDrain, name: 'renamed' });
        });
        expect(
          await run('update', 'drn_integration', '--name', 'renamed')
        ).toBe(0);
        expect(body).toEqual({ name: 'renamed' });
      });
    });

    it('requires an option to change', async () => {
      expect(await run('update', 'drn_logs', '--json')).toBe(2);
      expect(stderrJson()).toMatchObject({ reason: 'missing_arguments' });
    });

    it('rejects invalid options before any request', async () => {
      expect(
        await run('update', 'drn_logs', '--url', 'ftp://example.com', '--json')
      ).toBe(2);
      expect(stderrJson()).toMatchObject({
        reason: 'invalid_arguments',
        data: { issues: [{ field: 'url' }] },
      });
    });

    it('rejects --all with --project', async () => {
      expect(
        await run('update', 'drn_logs', '--all', '--project', 'acme-web')
      ).toBe(2);
    });
  });

  describe('pause', () => {
    it('needs --yes when it cannot prompt', async () => {
      client.nonInteractive = true;
      client.scenario.get('/v1/drains/drn_logs', (_req, res) =>
        res.json(logsDrain)
      );
      expect(await run('pause', 'drn_logs')).toBe(1);
      const error = stderrJson();
      expect(error).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        userActionRequired: true,
        data: { effects: ['Pause drain drn_logs'] },
      });
      expect(error.next[0].command).toContain('--yes');
    });

    it('pauses after confirming', async () => {
      let body: any;
      client.scenario.get('/v1/drains/drn_logs', (_req, res) =>
        res.json(logsDrain)
      );
      client.scenario.patch('/v1/drains/drn_logs', (req, res) => {
        body = req.body;
        res.json(pausedDrain);
      });
      const exitCode = run('pause', 'drn_logs');
      await expect(client.stderr).toOutput('Pause drain acme-logs?');
      client.stdin.write('y\n');
      expect(await exitCode).toBe(0);
      expect(body).toEqual({ status: 'disabled' });
      expect(client.stderr.getFullOutput()).toMatch(/Paused\s+acme-paused/);
    });

    it('is a no-op for a paused drain', async () => {
      client.scenario.get('/v1/drains/drn_paused', (_req, res) =>
        res.json(pausedDrain)
      );
      expect(await run('pause', 'drn_paused', '--yes', '--json')).toBe(0);
      expect(stdoutJson().outcome).toBe('unchanged');
    });
  });

  describe('resume', () => {
    it('resumes a paused drain without a prompt', async () => {
      let body: any;
      client.scenario.get('/v1/drains/drn_paused', (_req, res) =>
        res.json(pausedDrain)
      );
      client.scenario.patch('/v1/drains/drn_paused', (req, res) => {
        body = req.body;
        res.json({ ...pausedDrain, status: 'enabled' });
      });
      expect(await run('resume', 'drn_paused', '--json')).toBe(0);
      expect(body).toEqual({ status: 'enabled' });
      expect(stdoutJson().outcome).toBe('resumed');
    });

    it('explains when Vercel disabled the drain', async () => {
      client.scenario.get('/v1/drains/drn_paused', (_req, res) =>
        res.json({ ...pausedDrain, disabledReason: 'disabled-by-admin' })
      );
      client.scenario.patch('/v1/drains/drn_paused', (_req, res) =>
        res.status(400).json({
          error: {
            code: 'drain_enable_not_allowed',
            message: 'Drain is disabled by vercel',
          },
        })
      );
      expect(await run('resume', 'drn_paused', '--json')).toBe(1);
      expect(stderrJson()).toMatchObject({
        reason: 'conflict',
        message: "Can't resume drain drn_paused. Vercel disabled it.",
        data: { remoteMessage: 'Drain is disabled by vercel' },
      });
    });
  });

  describe('delete', () => {
    it('deletes with --yes', async () => {
      let deleted = false;
      client.scenario.get('/v1/drains/drn_logs', (_req, res) =>
        res.json(logsDrain)
      );
      client.scenario.delete('/v1/drains/drn_logs', (_req, res) => {
        deleted = true;
        res.status(204).end();
      });
      expect(await run('rm', 'drn_logs', '--yes', '--json')).toBe(0);
      expect(deleted).toBe(true);
      expect(stdoutJson()).toMatchObject({
        drain: { id: 'drn_logs', name: 'acme-logs' },
        outcome: 'deleted',
      });
    });

    it('does nothing when the prompt is declined', async () => {
      let deleted = false;
      client.scenario.get('/v1/drains/drn_logs', (_req, res) =>
        res.json(logsDrain)
      );
      client.scenario.delete('/v1/drains/drn_logs', (_req, res) => {
        deleted = true;
        res.status(204).end();
      });
      const exitCode = run('delete', 'drn_logs');
      await expect(client.stderr).toOutput('Delete drain acme-logs?');
      client.stdin.write('n\n');
      expect(await exitCode).toBe(130);
      expect(deleted).toBe(false);
      expect(client.stderr.getFullOutput()).toContain('Nothing was changed.');
    });

    it('needs --yes with --json', async () => {
      client.scenario.get('/v1/drains/drn_logs', (_req, res) =>
        res.json(logsDrain)
      );
      expect(await run('delete', 'drn_logs', '--json')).toBe(1);
      expect(stderrJson()).toMatchObject({ reason: 'confirmation_required' });
    });
  });

  describe('errors without an API response', () => {
    it('reports a network failure as JSON with --json', () => {
      const err = Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      });
      expect(handleUnexpectedError(client, true, err)).toBe(1);
      expect(stderrJson()).toMatchObject({
        status: 'error',
        reason: 'network_error',
      });
      expect(client.stdout.getFullOutput()).toBe('');
    });

    it('reports a bug as JSON in a non-interactive run', () => {
      client.nonInteractive = true;
      expect(handleUnexpectedError(client, false, new Error('oops'))).toBe(1);
      expect(stderrJson()).toMatchObject({ reason: 'internal_error' });
    });
  });
});
