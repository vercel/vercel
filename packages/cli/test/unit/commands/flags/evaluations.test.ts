import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import { writeFileSync } from 'fs';
import { join } from 'path';
import flags from '../../../../src/commands/flags';
import type { Flag } from '../../../../src/util/flags/types';
import {
  removeProjectLink,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultFlags, useFlags } from '../../../mocks/flags';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

const ROLLUP = 'vercel_flag_evaluation_flag_evaluations_sum';
const evaluationFlags: Flag[] = [
  ...defaultFlags,
  {
    ...defaultFlags[1],
    id: 'flag_number789',
    slug: 'number-feature',
    kind: 'number',
    variants: [
      { id: 'default', value: 10, label: 'Small' },
      { id: 'variant-a', value: 20, label: 'Large' },
    ],
  },
  {
    ...defaultFlags[1],
    id: 'flag_json999',
    slug: 'json-feature',
    kind: 'json',
    variants: [
      {
        id: 'default',
        value: { theme: 'light', sidebar: false },
        label: 'Light',
      },
      {
        id: 'variant-a',
        value: ['dark', 'compact'],
        label: 'Dark',
      },
      { id: 'disabled', value: null, label: 'Disabled' },
    ],
  },
];

describe('flags evaluations', () => {
  let postedBody: Record<string, unknown> | undefined;
  let postedQuery: Record<string, unknown> | undefined;
  let flagLookupFailure:
    | { status: number; code: string; message: string }
    | undefined;

  beforeEach(() => {
    client.reset();
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
      accountId: 'team_dummy',
    });
    client.cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    process.env.VERCEL_FLAG_EVALUATIONS_API_URL = new URL(
      '/api/observability/metrics',
      client.apiUrl
    ).href;
    postedBody = undefined;
    postedQuery = undefined;
    flagLookupFailure = undefined;
    client.scenario.get(
      '/v1/projects/:projectId/feature-flags/flags/:flagIdOrSlug',
      (_req, res, next) => {
        if (!flagLookupFailure) {
          next?.();
          return;
        }
        res.status(flagLookupFailure.status).json({
          error: {
            code: flagLookupFailure.code,
            message: flagLookupFailure.message,
          },
        });
      }
    );
    useFlags(evaluationFlags);
  });

  afterEach(() => {
    delete process.env.VERCEL_FLAG_EVALUATIONS_API_URL;
  });

  function useEvaluationsResponse({
    data = [],
    summary = [],
  }: {
    data?: Record<string, unknown>[];
    summary?: Record<string, unknown>[];
  } = {}) {
    client.scenario.post('/api/observability/metrics', (req, res) => {
      postedBody = req.body as Record<string, unknown>;
      postedQuery = req.query as Record<string, unknown>;
      res.json({
        data,
        summary,
        statistics: { rowsRead: 42, bytesRead: 1024 },
      });
    });
  }

  it('queries and displays evaluations for the canonical flag slug', async () => {
    useEvaluationsResponse({
      data: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          flagVariant: 'off',
          [ROLLUP]: 3,
        },
        {
          timestamp: '2026-07-10T10:05:00.000Z',
          flagVariant: 'off',
          [ROLLUP]: 5,
        },
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          flagVariant: 'on',
          [ROLLUP]: 2,
        },
        {
          timestamp: '2026-07-10T10:05:00.000Z',
          flagVariant: '',
          [ROLLUP]: 1,
        },
      ],
      summary: [
        { flagVariant: 'off', [ROLLUP]: 8 },
        { flagVariant: 'on', [ROLLUP]: 2 },
        { flagVariant: '', [ROLLUP]: 1 },
      ],
    });

    client.setArgv(
      'flags',
      'evaluations',
      defaultFlags[0].id,
      '--since',
      '2026-07-10T10:00:00.000Z',
      '--until',
      '2026-07-10T10:10:00.000Z',
      '--granularity',
      '5m'
    );
    const exitCode = await flags(client);

    expect(exitCode).toBe(0);
    expect(postedQuery).toMatchObject({ ownerId: 'team_dummy' });
    expect(postedBody).toMatchObject({
      scope: {
        type: 'project',
        ownerId: 'team_dummy',
        projectIds: ['vercel-flags-test'],
      },
      reason: 'flag_evaluation_chart',
      event: 'flagEvaluation',
      rollups: {
        [ROLLUP]: {
          measure: 'flagEvaluations',
          aggregation: 'sum',
        },
      },
      orderBy: ROLLUP,
      orderDirection: 'desc',
      groupBy: ['flagVariant'],
      limit: 101,
      limitRanking: 'single_pass',
      tailRollup: 'truncate',
      summaryOnly: false,
      filter: "flagKey eq 'my-feature'",
      granularity: { minutes: 5 },
      startTime: '2026-07-10T10:00:00.000Z',
      endTime: '2026-07-10T10:10:00.000Z',
    });

    const stdout = stripAnsi(client.stdout.getFullOutput());
    expect(stdout).not.toContain('Metric:');
    expect(stdout).not.toContain('Filter:');
    expect(stdout).not.toContain('Order By:');
    expect(stdout).toContain('Period:');
    expect(stdout).toContain('(UTC) [10m]');
    expect(stdout).toContain('Variants');
    expect(stdout).not.toContain('flag_variant');
    expect(stdout).toContain('false: Off');
    expect(stdout).toContain('true: On');
    expect(stdout).toContain('Default in Code');
    expect(stdout).not.toContain('Chart:');
    expect(stdout).not.toContain('  Chart');
    expect(stdout).not.toContain('sparklines:');
    expect(stdout).not.toContain('sparkline');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:evaluations', value: 'evaluations' },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'option:since', value: '[REDACTED]' },
      { key: 'option:until', value: '[REDACTED]' },
      { key: 'option:granularity', value: '5m' },
    ]);
  });

  it('aligns query bounds outward to granularity boundaries', async () => {
    useEvaluationsResponse();
    client.setArgv(
      'flags',
      'evaluations',
      'my-feature',
      '--since',
      '2026-07-10T09:03:27.123Z',
      '--until',
      '2026-07-10T10:03:27.123Z'
    );

    const exitCode = await flags(client);

    expect(exitCode).toBe(0);
    expect(postedBody).toMatchObject({
      granularity: { minutes: 1 },
      startTime: '2026-07-10T09:03:00.000Z',
      endTime: '2026-07-10T10:04:00.000Z',
    });
  });

  it('outputs machine-readable JSON with exact bucket data', async () => {
    useEvaluationsResponse({
      data: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          flagVariant: 'off',
          [ROLLUP]: 3,
        },
        {
          timestamp: '2026-07-10T10:01:00.000Z',
          flagVariant: '',
          [ROLLUP]: 1,
        },
      ],
      summary: [
        { flagVariant: 'off', [ROLLUP]: 3 },
        { flagVariant: '', [ROLLUP]: 1 },
        ...Array.from({ length: 98 }, (_, index) => ({
          flagVariant: `unused-${index}`,
          [ROLLUP]: 0,
        })),
      ],
    });
    client.setArgv(
      'flags',
      'evaluations',
      'my-feature',
      '--since',
      '2026-07-10T10:00:00.000Z',
      '--until',
      '2026-07-10T11:00:00.000Z',
      '--json'
    );

    const exitCode = await flags(client);

    expect(exitCode).toBe(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json).toEqual({
      flag: 'my-feature',
      variants: { off: false, on: true },
      startTime: '2026-07-10T10:00:00.000Z',
      endTime: '2026-07-10T11:00:00.000Z',
      granularity: { minutes: 1 },
      truncated: false,
      buckets: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          variant: 'off',
          evaluations: 3,
        },
        {
          timestamp: '2026-07-10T10:01:00.000Z',
          variant: '',
          evaluations: 1,
        },
      ],
    });
    expect(client.stderr.getFullOutput()).not.toContain(
      'Querying flag evaluations'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:evaluations', value: 'evaluations' },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'option:since', value: '[REDACTED]' },
      { key: 'option:until', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it.each([
    {
      kind: 'boolean',
      flagSlug: 'my-feature',
      expectedVariants: { off: false, on: true },
    },
    {
      kind: 'string',
      flagSlug: 'another-feature',
      expectedVariants: { default: 'control', 'variant-a': 'variant-a' },
    },
    {
      kind: 'number',
      flagSlug: 'number-feature',
      expectedVariants: { default: 10, 'variant-a': 20 },
    },
    {
      kind: 'json',
      flagSlug: 'json-feature',
      expectedVariants: {
        default: { theme: 'light', sidebar: false },
        'variant-a': ['dark', 'compact'],
        disabled: null,
      },
    },
  ])('maps $kind variant IDs to raw values in JSON output', async ({
    flagSlug,
    expectedVariants,
  }) => {
    useEvaluationsResponse();
    client.setArgv(
      'flags',
      'evaluations',
      flagSlug,
      '--since',
      '2026-07-10T10:00:00.000Z',
      '--until',
      '2026-07-10T11:00:00.000Z',
      '--json'
    );

    const exitCode = await flags(client);

    expect(exitCode).toBe(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.variants).toEqual(expectedVariants);
  });

  it('discloses when variants are truncated and preserves response order', async () => {
    const variants = Array.from(
      { length: 101 },
      (_, index) => `variant-${index}`
    );
    useEvaluationsResponse({
      summary: variants.map((variant, index) => ({
        flagVariant: variant,
        [ROLLUP]: variants.length - index,
      })),
      data: ['variant-100', 'variant-99', 'variant-0'].map(
        (variant, index) => ({
          timestamp: '2026-07-10T10:00:00.000Z',
          flagVariant: variant,
          [ROLLUP]: index + 1,
        })
      ),
    });
    client.setArgv(
      'flags',
      'evaluations',
      'my-feature',
      '--since',
      '2026-07-10T10:00:00.000Z',
      '--until',
      '2026-07-10T11:00:00.000Z',
      '--json'
    );

    expect(await flags(client)).toBe(0);

    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.truncated).toBe(true);
    expect(
      json.buckets.map((bucket: { variant: string }) => bucket.variant)
    ).toEqual(['variant-99', 'variant-0']);
    expect(json.buckets).not.toContainEqual(
      expect.objectContaining({ variant: 'variant-100' })
    );
  });

  it('warns when human-readable results omit additional variants', async () => {
    useEvaluationsResponse({
      summary: Array.from({ length: 101 }, (_, index) => ({
        flagVariant: `variant-${index}`,
        [ROLLUP]: 101 - index,
      })),
    });
    client.setArgv('flags', 'evaluations', 'my-feature');

    expect(await flags(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'Results are limited to the 100 most evaluated variants.'
    );
  });

  it('prints a no-data result without failing', async () => {
    useEvaluationsResponse();
    client.setArgv(
      'flags',
      'evaluations',
      'my-feature',
      '--since',
      '2026-07-10T10:00:00.000Z',
      '--until',
      '2026-07-10T11:00:00.000Z'
    );

    const exitCode = await flags(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toContain(
      'No data found for this period.'
    );
  });

  it('supports --project outside a linked directory', async () => {
    useEvaluationsResponse();
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    removeProjectLink(cwd);
    client.cwd = cwd;
    client.setArgv(
      'flags',
      'evaluations',
      'my-feature',
      '--project',
      'vercel-flags-test'
    );

    const exitCode = await flags(client);

    expect(exitCode).toBe(0);
    expect(postedBody?.scope).toEqual({
      type: 'project',
      ownerId: 'team_dummy',
      projectIds: ['vercel-flags-test'],
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:evaluations', value: 'evaluations' },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'option:project', value: '[REDACTED]' },
    ]);
  });

  it('rejects invalid time ranges before querying', async () => {
    client.setArgv(
      'flags',
      'evaluations',
      'my-feature',
      '--since',
      '2026-07-10T11:00:00.000Z',
      '--until',
      '2026-07-10T10:00:00.000Z'
    );
    expect(await flags(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'The start time must be before the end time'
    );
    expect(postedBody).toBeUndefined();
  });

  it.each([
    ['1m', { minutes: 1 }],
    ['5m', { minutes: 5 }],
    ['15m', { minutes: 15 }],
    ['1h', { hours: 1 }],
    ['4h', { hours: 4 }],
    ['1d', { days: 1 }],
  ])('accepts the supported %s granularity', async (value, duration) => {
    useEvaluationsResponse();
    client.setArgv(
      'flags',
      'evaluations',
      'my-feature',
      '--granularity',
      value
    );

    expect(await flags(client)).toBe(0);
    expect(postedBody?.granularity).toEqual(duration);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:evaluations', value: 'evaluations' },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'option:granularity', value },
    ]);
  });

  it('rejects unsupported granularities locally and redacts them', async () => {
    client.setArgv(
      'flags',
      'evaluations',
      'my-feature',
      '--granularity',
      '10m'
    );

    expect(await flags(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Invalid granularity "10m". Use one of: 1m, 5m, 15m, 1h, 4h, 1d.'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:evaluations', value: 'evaluations' },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'option:granularity', value: '[REDACTED]' },
    ]);
    expect(postedBody).toBeUndefined();
  });

  it('returns project resolution failures as valid JSON', async () => {
    useUnknownProject();
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    removeProjectLink(cwd);
    client.cwd = cwd;
    client.setArgv(
      'flags',
      'evaluations',
      'my-feature',
      '--project',
      'no-such-project',
      '--json'
    );

    expect(await flags(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: {
        code: 'PROJECT_NOT_FOUND',
        message:
          'Project "no-such-project" was not found in the current scope.',
      },
    });
    expect(client.stderr.getFullOutput()).not.toContain(
      'If it lives in a different team'
    );
  });

  it('returns an unlinked project error as valid JSON', async () => {
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    removeProjectLink(cwd);
    client.cwd = cwd;
    client.setArgv('flags', 'evaluations', 'my-feature', '--json');

    expect(await flags(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: {
        code: 'NOT_LINKED',
        message:
          "Your codebase isn't linked to a project on Vercel. Pass --project <name>, or run `vercel link` to link it.",
      },
    });
  });

  it('returns project resolution exceptions as valid JSON', async () => {
    writeFileSync(join(client.cwd, '.vercel/project.json'), '{invalid');
    client.setArgv('flags', 'evaluations', 'my-feature', '--json');

    expect(await flags(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: {
        code: 'UNEXPECTED_ERROR',
        message:
          'Project Settings could not be retrieved. To link your project again, remove the ' +
          `${join(client.cwd, '.vercel')} directory.`,
      },
    });
  });

  it('rejects a missing flag argument', async () => {
    client.setArgv('flags', 'evaluations');

    const exitCode = await flags(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required argument: flag'
    );
  });

  it('returns API failures as JSON errors', async () => {
    client.scenario.post('/api/observability/metrics', (_req, res) => {
      res.status(403).json({
        error: { code: 'forbidden', message: 'Not allowed' },
      });
    });
    client.setArgv('flags', 'evaluations', 'my-feature', '--json');

    const exitCode = await flags(client);

    expect(exitCode).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: {
        code: 'FORBIDDEN',
        message:
          'You do not have permission to query metrics for this project/team.',
      },
    });
  });

  it('does not map flag lookup failures to metrics errors', async () => {
    flagLookupFailure = {
      status: 403,
      code: 'flag_access_denied',
      message: 'You cannot inspect this feature flag.',
    };
    client.setArgv('flags', 'evaluations', 'my-feature', '--json');

    expect(await flags(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: {
        code: 'flag_access_denied',
        message: 'You cannot inspect this feature flag.',
      },
    });
    expect(client.stdout.getFullOutput()).not.toContain(
      'permission to query metrics'
    );
    expect(postedBody).toBeUndefined();
  });

  describe('--help', () => {
    it('prints help and tracks telemetry', async () => {
      client.setArgv('flags', 'evaluations', '--help');

      const exitCode = await flags(client);

      expect(exitCode).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        'Display evaluation metrics for a feature flag'
      );
      expect(client.stderr.getFullOutput()).toContain('--since');
      expect(client.stderr.getFullOutput()).toContain('--json');
      expect(client.stderr.getFullOutput()).toContain(
        '1m, 5m, 15m, 1h, 4h, 1d'
      );
      expect(client.stderr.getFullOutput()).not.toContain('--format');
      expect(client.stderr.getFullOutput()).not.toContain('--group-by');
      expect(client.stderr.getFullOutput()).not.toContain('--filter');
      expect(client.stderr.getFullOutput()).not.toContain('--limit');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'flags:evaluations' },
      ]);
    });
  });
});
