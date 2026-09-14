import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import traces from '../../../../src/commands/traces';
import * as linkModule from '../../../../src/util/projects/link';
import type { ProjectTracing } from '@vercel-internals/types';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_test',
      name: 'traces-project',
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

/**
 * Stands in for the shared resolver, which looks an explicit `--project` up in
 * the scope `--scope` selected and answers with that project's own ids.
 */
function mockResolvedProject({
  projectId,
  projectName,
  orgId,
  orgSlug,
}: {
  projectId: string;
  projectName: string;
  orgId: string;
  orgSlug: string;
}) {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: projectId,
      name: projectName,
      accountId: orgId,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: { id: orgId, slug: orgSlug, type: 'team' },
  });
}

/**
 * Registers `GET /v9/projects/prj_test` returning a project with the given
 * `tracing` value, and reports how many times it was called.
 */
function useProjectWithTracing(tracing: ProjectTracing | null | undefined) {
  const calls = { get: 0 };
  client.scenario.get('/v9/projects/:idOrName', (req, res) => {
    calls.get += 1;
    res.json({
      id: 'prj_test',
      name: req.params.idOrName === 'prj_test' ? 'traces-project' : 'other-app',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
      ...(tracing === undefined ? {} : { tracing }),
    });
  });
  return calls;
}

describe('vercel traces config ls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    client.nonInteractive = false;
  });

  it('prints a table of rules with the count, percent rates, and the all-paths label', async () => {
    mockLinkedProject();
    useProjectWithTracing({
      samplingRules: [
        { rate: 0.25, env: 'production', destination: 'internal' },
        {
          rate: 1,
          env: 'preview',
          requestPath: '/api',
          destination: 'internal',
        },
        { rate: 0.1, requestPath: '/blog', destination: 'internal' },
      ],
    });

    client.setArgv('traces', 'config', 'ls');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Trace sampling rules for traces-project');
    expect(stderr).toContain('3 of 10 rules');
    expect(stderr).toContain('environment');
    expect(stderr).toContain('production');
    expect(stderr).toContain('(all paths)');
    expect(stderr).toContain('25%');
    expect(stderr).toContain('100%');
    expect(stderr).toContain('/blog');
    // `any` is the CLI word for a rule with no `env`.
    expect(stderr).toContain('any');
  });

  it('lists only rules for the internal destination', async () => {
    mockLinkedProject();
    useProjectWithTracing({
      samplingRules: [
        { rate: 0.25, env: 'production', destination: 'internal' },
        { rate: 1, env: 'preview', destination: 'external' },
        { rate: 0.5, requestPath: '/legacy' },
      ],
    });

    client.setArgv('traces', 'config', 'ls');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('1 of 10 rules');
    expect(stderr).toContain('25%');
    expect(stderr).not.toContain('100%');
    expect(stderr).not.toContain('/legacy');
  });

  it('sends the resolved team and project to the API', async () => {
    mockLinkedProject();
    let receivedQuery: Record<string, unknown> | undefined;
    let receivedPath: string | undefined;
    client.scenario.get('/v9/projects/:idOrName', (req, res) => {
      receivedQuery = req.query as Record<string, unknown>;
      receivedPath = req.params.idOrName;
      res.json({
        id: 'prj_test',
        name: 'traces-project',
        accountId: 'team_dummy',
        updatedAt: Date.now(),
        createdAt: Date.now(),
        tracing: { samplingRules: [] },
      });
    });

    client.setArgv('traces', 'config', 'ls');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(receivedPath).toBe('prj_test');
    expect(receivedQuery).toEqual({ teamId: 'team_dummy' });
  });

  it('uses --scope and --project from a directory that is not linked', async () => {
    mockResolvedProject({
      projectId: 'prj_other',
      projectName: 'other-app',
      orgId: 'team_flag',
      orgSlug: 'flag-team',
    });
    let receivedQuery: Record<string, unknown> | undefined;
    let receivedPath: string | undefined;
    client.scenario.get('/v9/projects/:idOrName', (req, res) => {
      receivedQuery = req.query as Record<string, unknown>;
      receivedPath = req.params.idOrName;
      res.json({
        id: 'prj_other',
        name: 'other-app',
        accountId: 'team_flag',
        updatedAt: Date.now(),
        createdAt: Date.now(),
        tracing: { samplingRules: [] },
      });
    });

    client.setArgv(
      'traces',
      'config',
      'ls',
      '--scope',
      'flag-team',
      '--project',
      'other-app'
    );
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(receivedPath).toBe('prj_other');
    expect(receivedQuery).toEqual({ teamId: 'team_flag' });
  });

  /**
   * `/v9/projects/:idOrName` takes a team id, not a slug: `client.fetch` drops a
   * non-`team_` value, which would resolve the project in the personal account.
   * The flags therefore go to the shared resolver, which looks the project up in
   * the selected scope and answers with ids, and never to the request.
   */
  it('resolves a --scope slug to a team id instead of sending it', async () => {
    mockResolvedProject({
      projectId: 'prj_other',
      projectName: 'other-app',
      orgId: 'team_flag',
      orgSlug: 'my-team',
    });
    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get('/v9/projects/:idOrName', (req, res) => {
      receivedQuery = req.query as Record<string, unknown>;
      res.json({
        id: 'prj_other',
        name: 'other-app',
        accountId: 'team_flag',
        updatedAt: Date.now(),
        createdAt: Date.now(),
        tracing: { samplingRules: [] },
      });
    });

    client.setArgv(
      'traces',
      'config',
      'ls',
      '--scope',
      'my-team',
      '--project',
      'other-app'
    );
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(receivedQuery).toEqual({ teamId: 'team_flag' });
    // The project name reaches the resolver, not the URL.
    expect(mockedGetLinkedProject).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        projectName: 'other-app',
        projectNameIsExplicit: true,
        scopeIsExplicit: true,
      })
    );
  });

  /**
   * A linked directory already names its team, so an explicit `--scope` can only
   * disagree with it. The disagreement is reported rather than resolved one way
   * or the other, because either choice reads a project under another team's
   * name.
   */
  it('exits 1 when --scope disagrees with the linked project', async () => {
    mockLinkedProject();
    const calls = useProjectWithTracing({ samplingRules: [] });

    client.setArgv('traces', 'config', 'ls', '--scope', 'other-team');
    const exitCode = await traces(client);

    expect(exitCode).toBe(1);
    expect(calls.get).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('traces-project');
    expect(stderr).toContain('my-team');
    expect(stderr).toContain('--project');
  });

  it('prints an empty state with the `set` hint when there are no rules', async () => {
    mockLinkedProject();
    useProjectWithTracing({ samplingRules: [] });

    client.setArgv('traces', 'config', 'ls');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('No trace sampling rules for traces-project.');
    expect(stderr).toContain('traces config set');
    // The hint replaces the table, rather than printing an empty one.
    expect(stderr).not.toContain('(all paths)');
  });

  it('treats a null `tracing` object as an empty rule list', async () => {
    mockLinkedProject();
    useProjectWithTracing(null);

    client.setArgv('traces', 'config', 'ls');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No trace sampling rules for traces-project.'
    );
  });

  it('treats an absent `tracing` object as an empty rule list', async () => {
    mockLinkedProject();
    useProjectWithTracing(undefined);

    client.setArgv('traces', 'config', 'ls');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No trace sampling rules for traces-project.'
    );
  });

  it('accepts `list` as an alias', async () => {
    mockLinkedProject();
    useProjectWithTracing({ samplingRules: [] });

    client.setArgv('traces', 'config', 'list');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No trace sampling rules for traces-project.'
    );
  });

  it('uses --project to override the linked project', async () => {
    mockResolvedProject({
      projectId: 'prj_other',
      projectName: 'other-app',
      orgId: 'team_dummy',
      orgSlug: 'my-team',
    });
    let receivedPath: string | undefined;
    client.scenario.get('/v9/projects/:idOrName', (req, res) => {
      receivedPath = req.params.idOrName;
      res.json({
        id: 'prj_other',
        name: 'other-app',
        accountId: 'team_dummy',
        updatedAt: Date.now(),
        createdAt: Date.now(),
        tracing: { samplingRules: [] },
      });
    });

    client.setArgv('traces', 'config', 'ls', '--project', 'other-app');
    const exitCode = await traces(client);

    expect(exitCode).toBe(0);
    expect(receivedPath).toBe('prj_other');
    expect(client.stderr.getFullOutput()).toContain(
      'No trace sampling rules for other-app.'
    );
  });

  it('exits 1 with the shared traces message when nothing resolves the project', async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });
    const calls = useProjectWithTracing({ samplingRules: [] });

    client.setArgv('traces', 'config', 'ls');
    const exitCode = await traces(client);

    expect(exitCode).toBe(1);
    expect(calls.get).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('vercel link');
    expect(stderr).toContain('--scope');
    expect(stderr).toContain('--project');
  });

  describe('--json', () => {
    it('prints the bare rows in CLI vocabulary', async () => {
      mockLinkedProject();
      useProjectWithTracing({
        samplingRules: [
          { rate: 0.25, env: 'production', destination: 'internal' },
          {
            rate: 1,
            env: 'preview',
            requestPath: '/api',
            destination: 'internal',
          },
          { rate: 0.01, requestPath: '/blog', destination: 'internal' },
          { rate: 0.75, requestPath: '/external', destination: 'external' },
        ],
      });

      client.setArgv('traces', 'config', 'ls', '--json');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual([
        { environment: 'production', requestPath: null, sampleRate: 25 },
        { environment: 'preview', requestPath: '/api', sampleRate: 100 },
        { environment: 'any', requestPath: '/blog', sampleRate: 1 },
      ]);
    });

    it('keeps prose off stdout', async () => {
      mockLinkedProject();
      useProjectWithTracing({ samplingRules: [] });

      client.setArgv('traces', 'config', 'ls', '--json');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(client.stdout.getFullOutput().trim()).toBe('[]');
    });

    it('accepts --format json', async () => {
      mockLinkedProject();
      useProjectWithTracing({
        samplingRules: [{ rate: 0.5, destination: 'internal' }],
      });

      client.setArgv('traces', 'config', 'ls', '--format', 'json');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual([
        { environment: 'any', requestPath: null, sampleRate: 50 },
      ]);
    });

    it('exits 1 on an unsupported --format value', async () => {
      mockLinkedProject();
      const calls = useProjectWithTracing({ samplingRules: [] });

      client.setArgv('traces', 'config', 'ls', '--format', 'yaml');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(calls.get).toBe(0);
    });
  });

  describe('non-interactive mode', () => {
    it('prints the agent envelope', async () => {
      mockLinkedProject();
      useProjectWithTracing({
        samplingRules: [
          { rate: 0.25, env: 'production', destination: 'internal' },
          { rate: 0.75, env: 'preview', destination: 'external' },
        ],
      });

      client.nonInteractive = true;
      client.setArgv('traces', 'config', 'ls');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('ok');
      expect(payload.projectId).toBe('prj_test');
      expect(payload.projectName).toBe('traces-project');
      expect(payload.rules).toEqual([
        { environment: 'production', requestPath: null, sampleRate: 25 },
      ]);
      expect(payload.message).toContain('1 of 10');
      expect(payload.next[0].command).toContain('traces config set');
    });

    it('reports the empty state in the envelope message', async () => {
      mockLinkedProject();
      useProjectWithTracing(null);

      client.nonInteractive = true;
      client.setArgv('traces', 'config', 'ls');
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('ok');
      expect(payload.rules).toEqual([]);
      expect(payload.message).toContain('No trace sampling rules');
    });
  });

  describe('errors', () => {
    /**
     * An agent parses stdout, where the success payload goes, so an API failure
     * answers there too. The reason is what it branches on: prose on stderr
     * cannot tell it apart from "no project".
     */
    describe('non-interactive mode', () => {
      afterEach(() => {
        client.nonInteractive = false;
      });

      function spyExit() {
        return vi.spyOn(process, 'exit').mockImplementation((() => {
          throw new Error('exit');
        }) as () => never);
      }

      it('emits permission_denied JSON on 403', async () => {
        const exitSpy = spyExit();
        mockLinkedProject();
        client.scenario.get('/v9/projects/:idOrName', (_req, res) => {
          res.status(403).json({
            error: {
              code: 'forbidden',
              message:
                'You do not have permission to read observability settings',
            },
          });
        });

        client.nonInteractive = true;
        client.setArgv('traces', 'config', 'ls');

        await expect(traces(client)).rejects.toThrow('exit');

        const payload = JSON.parse(client.stdout.getFullOutput().trim());
        expect(payload.status).toBe('error');
        expect(payload.reason).toBe('permission_denied');
        expect(payload.message).toBe(
          'You do not have permission to read observability settings'
        );

        exitSpy.mockRestore();
      });

      it('emits not_found JSON on 404', async () => {
        const exitSpy = spyExit();
        mockLinkedProject();
        client.scenario.get('/v9/projects/:idOrName', (_req, res) => {
          res
            .status(404)
            .json({ error: { code: 'not_found', message: 'nope' } });
        });

        client.nonInteractive = true;
        client.setArgv('traces', 'config', 'ls');

        await expect(traces(client)).rejects.toThrow('exit');

        const payload = JSON.parse(client.stdout.getFullOutput().trim());
        expect(payload.status).toBe('error');
        expect(payload.reason).toBe('not_found');
        expect(payload.message).toBe('nope');

        exitSpy.mockRestore();
      });

      it('emits api_error JSON on 500', async () => {
        const exitSpy = spyExit();
        mockLinkedProject();
        client.scenario.get('/v9/projects/:idOrName', (_req, res) => {
          res
            .status(500)
            .json({ error: { code: 'internal', message: 'boom' } });
        });

        client.nonInteractive = true;
        client.setArgv('traces', 'config', 'ls');

        await expect(traces(client)).rejects.toThrow('exit');

        const payload = JSON.parse(client.stdout.getFullOutput().trim());
        expect(payload.status).toBe('error');
        expect(payload.reason).toBe('api_error');

        exitSpy.mockRestore();
      });
    });

    it('surfaces the API message and exits 1 on 403', async () => {
      mockLinkedProject();
      client.scenario.get('/v9/projects/:idOrName', (_req, res) => {
        res.status(403).json({
          error: {
            code: 'forbidden',
            message:
              'You do not have permission to read observability settings',
          },
        });
      });

      client.setArgv('traces', 'config', 'ls');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'You do not have permission to read observability settings'
      );
    });

    it('exits 1 on 404', async () => {
      mockLinkedProject();
      client.scenario.get('/v9/projects/:idOrName', (_req, res) => {
        res.status(404).json({ error: { code: 'not_found', message: 'nope' } });
      });

      client.setArgv('traces', 'config', 'ls');
      const exitCode = await traces(client);

      expect(exitCode).toBe(1);
    });
  });

  describe('routing', () => {
    it('prints the group help and exits 2 for a bare `traces config`', async () => {
      mockLinkedProject();
      const calls = useProjectWithTracing({ samplingRules: [] });

      client.setArgv('traces', 'config');
      const exitCode = await traces(client);

      expect(exitCode).toBe(2);
      expect(calls.get).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('traces config');
      expect(stderr).toContain('ls');
    });

    it('prints the group help for `traces config --help`', async () => {
      client.setArgv('traces', 'config', '--help');
      const exitCode = await traces(client);

      expect(exitCode).toBe(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'traces:config' },
      ]);
    });

    it('prints the ls help for `traces config ls --help`', async () => {
      client.setArgv('traces', 'config', 'ls', '--help');
      const exitCode = await traces(client);

      expect(exitCode).toBe(2);
      expect(client.stderr.getFullOutput()).toContain('traces config ls');
    });
  });

  describe('telemetry', () => {
    it('tracks the subcommand and the flags', async () => {
      mockLinkedProject();
      useProjectWithTracing({ samplingRules: [] });

      client.setArgv(
        'traces',
        'config',
        'list',
        '--json',
        '--project',
        'traces-project'
      );
      const exitCode = await traces(client);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:config', value: 'config' },
        { key: 'subcommand:ls', value: 'list' },
        { key: 'flag:json', value: 'TRUE' },
        { key: 'option:project', value: '[REDACTED]' },
      ]);
    });
  });
});
