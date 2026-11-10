import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import flags from '../../../../src/commands/flags';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags } from '../../../mocks/flags';
import type { Flag, UpdateFlagRequest } from '../../../../src/util/flags/types';

// Helper to create fresh flag data for each test
function createTestFlags(): Flag[] {
  return [
    {
      id: 'flag_abc123',
      slug: 'my-feature',
      description: 'My awesome feature flag',
      kind: 'boolean',
      state: 'active',
      variants: [
        { id: 'off', value: false, label: 'Off' },
        { id: 'on', value: true, label: 'On' },
      ],
      environments: {
        production: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'off' },
          pausedOutcome: { type: 'variant', variantId: 'off' },
          rules: [],
        },
        preview: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'on' },
          pausedOutcome: { type: 'variant', variantId: 'off' },
          rules: [],
        },
        development: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'on' },
          pausedOutcome: { type: 'variant', variantId: 'off' },
          rules: [],
        },
      },
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 3600000,
      createdBy: 'user_123',
      projectId: 'vercel-flags-test',
      ownerId: 'team_dummy',
      revision: 1,
      seed: 12345,
      typeName: 'flag',
    },
    {
      id: 'flag_def456',
      slug: 'another-feature',
      description: 'Another feature flag',
      kind: 'string',
      state: 'active',
      variants: [
        { id: 'default', value: 'control', label: 'Control' },
        { id: 'variant-a', value: 'variant-a', label: 'Variant A' },
      ],
      environments: {
        production: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'default' },
          pausedOutcome: { type: 'variant', variantId: 'default' },
          rules: [],
        },
        preview: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'default' },
          pausedOutcome: { type: 'variant', variantId: 'default' },
          rules: [],
        },
        development: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'default' },
          pausedOutcome: { type: 'variant', variantId: 'default' },
          rules: [],
        },
      },
      createdAt: Date.now() - 172800000,
      updatedAt: Date.now() - 7200000,
      createdBy: 'user_123',
      projectId: 'vercel-flags-test',
      ownerId: 'team_dummy',
      revision: 2,
      seed: 67890,
      typeName: 'flag',
    },
  ];
}

describe('flags archive', () => {
  let testFlags: Flag[];
  let updateRequests: UpdateFlagRequest[];
  let postedBody: Record<string, unknown> | undefined;
  let postedQuery: Record<string, unknown> | undefined;
  let evaluationRequests: number;
  let evaluationsResponse:
    | { status: number }
    | { stalled: true }
    | { summary: Record<string, unknown>[] };

  beforeEach(() => {
    testFlags = createTestFlags();
    updateRequests = [];
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
    useFlags(testFlags, undefined, undefined, undefined, request => {
      updateRequests.push(request);
    });
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
    postedBody = undefined;
    postedQuery = undefined;
    evaluationRequests = 0;
    evaluationsResponse = { summary: [] };
    client.scenario.post('/metrics/v1', (req, res) => {
      evaluationRequests++;
      postedBody = req.body as Record<string, unknown>;
      postedQuery = req.query;
      if ('stalled' in evaluationsResponse) {
        return;
      }
      if ('status' in evaluationsResponse) {
        res.status(evaluationsResponse.status).json({
          error: { code: 'forbidden', message: 'Forbidden' },
        });
        return;
      }
      res.json({
        summary: evaluationsResponse.summary,
        queryId: 'query_test',
        meta: {
          sources: [],
          statistics: {
            elapsedMs: 1,
            databaseElapsedMs: 1,
            rowsRead: 1,
            bytesRead: 10,
          },
        },
      });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';
      const subcommand = 'archive';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('last 3 days');
      expect(stderr).not.toContain('last 7 days');

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('tracks `archive` subcommand', async () => {
    client.setArgv('flags', 'archive', testFlags[0].slug, '--yes');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:archive',
        value: 'archive',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
      {
        key: 'flag:yes',
        value: 'TRUE',
      },
    ]);
  });

  it.each([
    ['--message', 'Removed from code'],
    ['--message=Removed from code'],
    ['--message', '  Removed from code  '],
  ])('archives with a custom message: %j', async (...messageArgs) => {
    client.stdin.isTTY = false;
    client.setArgv(
      'flags',
      'archive',
      testFlags[0].slug,
      '--yes',
      ...messageArgs
    );

    expect(await flags(client)).toBe(0);
    expect(updateRequests).toEqual([
      { state: 'archived', message: 'Removed from code' },
    ]);
    expect(testFlags[0].state).toBe('archived');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:archive', value: 'archive' },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
      { key: 'option:message', value: '[REDACTED]' },
    ]);
  });

  it.each([
    [],
    ['--message', ''],
    ['--message', '   '],
  ])('uses the default message for omitted or blank input: %j', async (...messageArgs) => {
    client.stdin.isTTY = false;
    client.setArgv(
      'flags',
      'archive',
      testFlags[0].slug,
      '--yes',
      ...messageArgs
    );

    expect(await flags(client)).toBe(0);
    expect(updateRequests).toEqual([
      { state: 'archived', message: 'Archived via CLI' },
    ]);
  });

  it('keeps the custom message after interactive confirmation', async () => {
    client.stdin.isTTY = true;
    client.setArgv(
      'flags',
      'archive',
      testFlags[0].slug,
      '--message',
      'Removed from code'
    );
    const exitCodePromise = flags(client);

    await expect(client.stderr).toOutput(
      `Are you sure you want to archive ${testFlags[0].slug}?`
    );
    expect(updateRequests).toEqual([]);
    client.stdin.write('y\n');

    expect(await exitCodePromise).toBe(0);
    expect(updateRequests).toEqual([
      { state: 'archived', message: 'Removed from code' },
    ]);
  });

  it('rejects --message without a value before making requests', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    try {
      client.setArgv(
        'flags',
        'archive',
        testFlags[0].slug,
        '--yes',
        '--message'
      );

      expect(await flags(client)).toBe(2);
      expect(fetch).not.toHaveBeenCalled();
      expect(updateRequests).toEqual([]);
    } finally {
      fetch.mockRestore();
    }
  });

  it('does not treat --message as consent in non-interactive mode', async () => {
    (client.stdin as any).isTTY = false;
    client.setArgv(
      'flags',
      'archive',
      testFlags[0].slug,
      '--message',
      'Removed from code'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required option --yes'
    );
    expect(updateRequests).toEqual([]);
  });

  it('errors without flag argument', async () => {
    client.setArgv('flags', 'archive');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(2);
  });

  it('errors when flag is not found', async () => {
    client.setArgv('flags', 'archive', 'nonexistent-flag', '--yes');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('Flag not found');
  });

  it('warns when flag is already archived', async () => {
    testFlags[0].state = 'archived';

    client.setArgv(
      'flags',
      'archive',
      testFlags[0].slug,
      '--yes',
      '--message',
      'Removed from code'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('already archived');
    expect(updateRequests).toEqual([]);
  });

  describe('recent evaluations check', () => {
    it.each([
      {
        now: '2026-10-19T12:34:56.789Z',
        startTime: '2026-10-16T12:34:56.789Z',
      },
      {
        now: '2026-10-19T12:34:00.000Z',
        startTime: '2026-10-16T12:34:00.000Z',
      },
    ])('queries a summary of the last 3 days at $now', async ({
      now,
      startTime,
    }) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(now));
      client.setArgv('flags', 'archive', testFlags[0].slug, '--yes');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      expect(postedQuery).toEqual({ teamId: 'team_dummy' });
      expect(postedBody).toEqual({
        scope: {
          ownerId: 'team_dummy',
          projectIds: ['vercel-flags-test'],
        },
        timeRange: { start: startTime, end: now },
        metrics: {
          value: { metric: 'vercel.flags.evaluation', aggregation: 'sum' },
        },
        outputs: ['value'],
        filter: `flagKey:${JSON.stringify(testFlags[0].slug)}`,
      });
    });

    it('reports when no evaluations were found', async () => {
      client.setArgv('flags', 'archive', testFlags[0].slug, '--yes');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      expect(client.stderr.getFullOutput()).toContain(
        `No evaluations reported for ${testFlags[0].slug} in the last 3 days`
      );
      expect(client.stderr.getFullOutput()).toContain('has been archived');
    });

    it('warns and still archives with --yes when the flag was evaluated', async () => {
      evaluationsResponse = {
        summary: [{ dimensions: {}, values: { value: 1234 } }],
      };

      client.setArgv('flags', 'archive', testFlags[0].slug, '--yes');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        `${testFlags[0].slug} reported 1,234 evaluations in the last 3 days`
      );
      expect(stderr).toContain('Remove the flag from your code and deploy');
      expect(stderr).toContain('has been archived');
    });

    it('asks to archive anyway when the flag was evaluated', async () => {
      evaluationsResponse = {
        summary: [{ dimensions: {}, values: { value: 1 } }],
      };
      client.stdin.isTTY = true;

      client.setArgv('flags', 'archive', testFlags[0].slug);
      const exitCodePromise = flags(client);

      await expect(client.stderr).toOutput(
        `${testFlags[0].slug} reported 1 evaluation in the last 3 days`
      );
      await expect(client.stderr).toOutput(
        `Archive ${testFlags[0].slug} anyway?`
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Aborted');
      expect(await exitCodePromise).toEqual(0);
    });

    it.each([
      403, 429, 503,
    ])('continues archiving when metrics returns %i', async status => {
      evaluationsResponse = { status };

      client.setArgv('flags', 'archive', testFlags[0].slug, '--yes');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        `Could not check recent evaluations for ${testFlags[0].slug}`
      );
      expect(stderr).toContain('has been archived');
      expect(evaluationRequests).toBe(1);
    });

    it('continues archiving after the metrics deadline', async () => {
      evaluationsResponse = { stalled: true };
      client.setArgv('flags', 'archive', testFlags[0].slug, '--yes');

      expect(await flags(client)).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        `Could not check recent evaluations for ${testFlags[0].slug}`
      );
      expect(stderr).not.toContain('No evaluations reported');
      expect(stderr).toContain('has been archived');
      expect(evaluationRequests).toBe(1);
      expect(testFlags[0].state).toBe('archived');
    }, 10_000);

    it('preserves targeting and quotes paths in the recovery command', async () => {
      evaluationsResponse = { status: 403 };
      useProject({
        ...defaultProject,
        id: 'other-project',
        name: 'other-project',
        accountId: 'team_dummy',
      });
      client.cwd = setupTmpDir('flags project');
      client.setArgv(
        'flags',
        'archive',
        testFlags[0].slug,
        '--project',
        'other-project',
        '--scope',
        'team_dummy',
        '--cwd',
        client.cwd,
        '--token',
        'test-secret-token',
        '--yes'
      );

      expect(await flags(client)).toBe(0);
      expect(postedBody).toMatchObject({
        scope: { ownerId: 'team_dummy', projectIds: ['other-project'] },
      });
      const recovery = client.stderr
        .getFullOutput()
        .split('\n')
        .find(line => line.includes('Could not check recent evaluations'));
      expect(recovery).toContain(
        `vercel flags evaluations ${testFlags[0].slug} --since 3d --scope team_dummy --cwd '${client.cwd}' --project other-project`
      );
      expect(recovery).not.toContain('--yes');
      expect(recovery).not.toContain('--token');
      expect(recovery).not.toContain('test-secret-token');
    });
  });
});
