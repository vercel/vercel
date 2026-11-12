import { beforeEach, describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import { writeFileSync } from 'fs';
import { outputJSON } from 'fs-extra';
import { join } from 'path';
import flags from '../../../../src/commands/flags';
import type { Flag } from '../../../../src/util/flags/types';
import {
  removeProjectLink,
  setupUnitFixture,
  setupTmpDir,
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

// Fixture rows carry the value under this key until toCanonicalPoint moves it
// into `values.value`.
const FIXTURE_VALUE_KEY = 'evaluations';

function toCanonicalPoint(row: Record<string, unknown>) {
  const {
    timestamp: _timestamp,
    [FIXTURE_VALUE_KEY]: value,
    ...dimensions
  } = row;
  return { dimensions, values: { value } };
}
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
  let sdkKeysLookupFailure:
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
    postedBody = undefined;
    postedQuery = undefined;
    flagLookupFailure = undefined;
    sdkKeysLookupFailure = undefined;
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
    client.scenario.get(
      '/v1/projects/:projectId/feature-flags/sdk-keys',
      (_req, res, next) => {
        if (!sdkKeysLookupFailure) {
          next?.();
          return;
        }
        res.status(sdkKeysLookupFailure.status).json({
          error: {
            code: sdkKeysLookupFailure.code,
            message: sdkKeysLookupFailure.message,
          },
        });
      }
    );
    useFlags(evaluationFlags);
  });

  function useEvaluationsResponse({
    data = [],
    summary = [],
  }: {
    data?: Record<string, unknown>[];
    summary?: Record<string, unknown>[];
  } = {}) {
    client.scenario.post('/metrics/v1', (req, res) => {
      postedBody = req.body as Record<string, unknown>;
      postedQuery = req.query as Record<string, unknown>;
      res.json({
        series: data.map(row => ({
          timestamp: row.timestamp,
          ...toCanonicalPoint(row),
        })),
        summary: summary.map(toCanonicalPoint),
        queryId: 'query_123',
        meta: {
          sources: [{ id: 'flags' }],
          statistics: {
            elapsedMs: 10,
            databaseElapsedMs: 5,
            rowsRead: 42,
            bytesRead: 1024,
          },
        },
      });
    });
  }

  it('queries and displays evaluations for the canonical flag slug', async () => {
    useEvaluationsResponse({
      data: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          flagVariant: 'off',
          [FIXTURE_VALUE_KEY]: 3,
        },
        {
          timestamp: '2026-07-10T10:05:00.000Z',
          flagVariant: 'off',
          [FIXTURE_VALUE_KEY]: 5,
        },
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          flagVariant: 'on',
          [FIXTURE_VALUE_KEY]: 2,
        },
        {
          timestamp: '2026-07-10T10:05:00.000Z',
          flagVariant: '',
          [FIXTURE_VALUE_KEY]: 1,
        },
      ],
      summary: [
        { flagVariant: 'off', [FIXTURE_VALUE_KEY]: 8 },
        { flagVariant: 'on', [FIXTURE_VALUE_KEY]: 2 },
        { flagVariant: '', [FIXTURE_VALUE_KEY]: 1 },
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
    expect(postedQuery).toMatchObject({ teamId: 'team_dummy' });
    expect(postedBody).toEqual({
      scope: {
        ownerId: 'team_dummy',
        projectIds: ['vercel-flags-test'],
      },
      timeRange: {
        start: '2026-07-10T10:00:00.000Z',
        end: '2026-07-10T10:10:00.000Z',
      },
      bucketSeconds: 300,
      groupBy: ['flagVariant'],
      filter: 'flagKey:"my-feature"',
      metrics: {
        value: { metric: 'vercel.flags.evaluation', aggregation: 'sum' },
      },
      outputs: ['value'],
      seriesSelection: {
        limit: 101,
        mode: 'exact',
        rankBy: [{ metric: 'value', direction: 'desc' }],
      },
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
    expect(stdout).not.toContain('(not set)');
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
      bucketSeconds: 60,
      timeRange: {
        start: '2026-07-10T09:03:00.000Z',
        end: '2026-07-10T10:04:00.000Z',
      },
    });
  });

  it('outputs machine-readable JSON with exact bucket data', async () => {
    useEvaluationsResponse({
      data: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          flagVariant: 'off',
          [FIXTURE_VALUE_KEY]: 3,
        },
        {
          timestamp: '2026-07-10T10:01:00.000Z',
          flagVariant: '',
          [FIXTURE_VALUE_KEY]: 1,
        },
      ],
      summary: [
        { flagVariant: 'off', [FIXTURE_VALUE_KEY]: 3 },
        { flagVariant: '', [FIXTURE_VALUE_KEY]: 1 },
        ...Array.from({ length: 98 }, (_, index) => ({
          flagVariant: `unused-${index}`,
          [FIXTURE_VALUE_KEY]: 0,
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
    const stdout = client.stdout.getFullOutput();
    expect(stdout).not.toContain('"variant":');
    const json = JSON.parse(stdout);
    expect(json).toEqual({
      flag: 'my-feature',
      variants: { off: false, on: true },
      groupBy: ['variant'],
      startTime: '2026-07-10T10:00:00.000Z',
      endTime: '2026-07-10T11:00:00.000Z',
      granularity: { minutes: 1 },
      truncated: false,
      buckets: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          variantId: 'off',
          variantValue: false,
          evaluations: 3,
        },
        {
          timestamp: '2026-07-10T10:01:00.000Z',
          variantId: '',
          variantValue: 'Default in Code',
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

  it('keeps default-in-code buckets when the API omits the variant id', async () => {
    useEvaluationsResponse({
      summary: [
        { flagVariant: '', [FIXTURE_VALUE_KEY]: 59 },
        ...Array.from({ length: 100 }, (_, index) => ({
          flagVariant: `variant-${index}`,
          [FIXTURE_VALUE_KEY]: 100 - index,
        })),
      ],
      data: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          flagVariant: null,
          [FIXTURE_VALUE_KEY]: 59,
        },
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

    expect(await flags(client)).toBe(0);

    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.truncated).toBe(true);
    expect(json.buckets).toEqual([
      {
        timestamp: '2026-07-10T10:00:00.000Z',
        variantId: '',
        variantValue: 'Default in Code',
        evaluations: 59,
      },
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
        [FIXTURE_VALUE_KEY]: variants.length - index,
      })),
      data: ['variant-100', 'variant-99', 'variant-0'].map(
        (variant, index) => ({
          timestamp: '2026-07-10T10:00:00.000Z',
          flagVariant: variant,
          [FIXTURE_VALUE_KEY]: index + 1,
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
      json.buckets.map((bucket: { variantId: string }) => bucket.variantId)
    ).toEqual(['variant-99', 'variant-0']);
    expect(json.buckets).not.toContainEqual(
      expect.objectContaining({ variantId: 'variant-100' })
    );
  });

  it('warns when human-readable results omit additional variants', async () => {
    useEvaluationsResponse({
      summary: Array.from({ length: 101 }, (_, index) => ({
        flagVariant: `variant-${index}`,
        [FIXTURE_VALUE_KEY]: 101 - index,
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
    expect(await flags(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'The start time must be before the end time'
    );
    expect(postedBody).toBeUndefined();
  });

  it.each([
    ['1m', 60],
    ['5m', 300],
    ['15m', 900],
    ['1h', 3600],
    ['4h', 14400],
    ['1d', 86400],
  ])('accepts the supported %s granularity', async (value, bucketSeconds) => {
    useEvaluationsResponse();
    client.setArgv(
      'flags',
      'evaluations',
      'my-feature',
      '--granularity',
      value
    );

    expect(await flags(client)).toBe(0);
    expect(postedBody?.bucketSeconds).toBe(bucketSeconds);
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

    expect(await flags(client)).toBe(2);
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

  it('queries every flag in the project grouped by flag when no flag is given', async () => {
    useEvaluationsResponse({
      data: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          flagKey: 'my-feature',
          [FIXTURE_VALUE_KEY]: 30,
        },
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          flagKey: 'number-feature',
          [FIXTURE_VALUE_KEY]: 12,
        },
      ],
      summary: [
        { flagKey: 'my-feature', [FIXTURE_VALUE_KEY]: 30 },
        { flagKey: 'number-feature', [FIXTURE_VALUE_KEY]: 12 },
      ],
    });
    client.setArgv(
      'flags',
      'evaluations',
      '--since',
      '2026-07-10T10:00:00.000Z',
      '--until',
      '2026-07-10T11:00:00.000Z',
      '--granularity',
      '1h'
    );

    const exitCode = await flags(client);

    expect(exitCode).toBe(0);
    expect(postedBody).toMatchObject({ groupBy: ['flagKey'] });
    expect(postedBody).not.toHaveProperty('filter');
    const stdout = stripAnsi(client.stdout.getFullOutput());
    expect(stdout).toContain('Flags');
    expect(stdout).toContain('my-feature');
    expect(stdout).toContain('number-feature');
    expect(stdout).not.toContain('Variants');
  });

  it('groups by SDK key and client and resolves SDK key labels', async () => {
    useEvaluationsResponse({
      data: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          sdkKeyId: 'sdk_key_abc123',
          flagClientName: 'api-deployments',
          [FIXTURE_VALUE_KEY]: 20,
        },
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          sdkKeyId: 'unknown-hash',
          flagClientName: 'api-builds',
          [FIXTURE_VALUE_KEY]: 4,
        },
      ],
      summary: [
        {
          sdkKeyId: 'sdk_key_abc123',
          flagClientName: 'api-deployments',
          [FIXTURE_VALUE_KEY]: 20,
        },
        {
          sdkKeyId: 'unknown-hash',
          flagClientName: 'api-builds',
          [FIXTURE_VALUE_KEY]: 4,
        },
      ],
    });
    client.setArgv(
      'flags',
      'evaluations',
      'my-feature',
      '--group-by',
      'sdk-key',
      '--group-by',
      'client',
      '--since',
      '2026-07-10T10:00:00.000Z',
      '--until',
      '2026-07-10T11:00:00.000Z',
      '--granularity',
      '1h'
    );

    const exitCode = await flags(client);

    expect(exitCode).toBe(0);
    expect(postedBody).toMatchObject({
      groupBy: ['sdkKeyId', 'flagClientName'],
      filter: 'flagKey:"my-feature"',
    });
    const stdout = stripAnsi(client.stdout.getFullOutput());
    expect(stdout).toContain('SDK Keys');
    expect(stdout).toContain('Clients');
    expect(stdout).toContain('Production Server (production)');
    expect(stdout).toContain('unknown-hash (unknown or deleted key)');
    expect(stdout).toContain('api-deployments');
    expect(stdout).not.toContain('Variants');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:evaluations', value: 'evaluations' },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'option:since', value: '[REDACTED]' },
      { key: 'option:until', value: '[REDACTED]' },
      { key: 'option:granularity', value: '1h' },
      { key: 'option:group-by', value: 'sdk-key,client' },
    ]);
  });

  it('includes SDK key metadata in JSON when grouping by SDK key', async () => {
    useEvaluationsResponse({
      data: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          sdkKeyId: 'sdk_key_abc123',
          [FIXTURE_VALUE_KEY]: 20,
        },
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          sdkKeyId: 'unknown-hash',
          [FIXTURE_VALUE_KEY]: 4,
        },
      ],
      summary: [
        { sdkKeyId: 'sdk_key_abc123', [FIXTURE_VALUE_KEY]: 20 },
        { sdkKeyId: 'unknown-hash', [FIXTURE_VALUE_KEY]: 4 },
      ],
    });
    client.setArgv(
      'flags',
      'evaluations',
      '--group-by',
      'sdk-key',
      '--since',
      '2026-07-10T10:00:00.000Z',
      '--until',
      '2026-07-10T11:00:00.000Z',
      '--granularity',
      '1h',
      '--json'
    );

    const exitCode = await flags(client);

    expect(exitCode).toBe(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json).toEqual({
      flag: null,
      groupBy: ['sdk-key'],
      startTime: '2026-07-10T10:00:00.000Z',
      endTime: '2026-07-10T11:00:00.000Z',
      granularity: { hours: 1 },
      truncated: false,
      buckets: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          sdkKeyId: 'sdk_key_abc123',
          sdkKeyLabel: 'Production Server',
          sdkKeyEnvironment: 'production',
          evaluations: 20,
        },
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          sdkKeyId: 'unknown-hash',
          sdkKeyLabel: null,
          sdkKeyEnvironment: null,
          evaluations: 4,
        },
      ],
    });
  });

  it('groups by datafile revision and client', async () => {
    useEvaluationsResponse({
      data: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          datafileRevision: '7',
          flagClientName: 'api-deployments',
          [FIXTURE_VALUE_KEY]: 20,
        },
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          datafileRevision: '6',
          flagClientName: 'api-builds',
          [FIXTURE_VALUE_KEY]: 4,
        },
      ],
      summary: [
        {
          datafileRevision: '7',
          flagClientName: 'api-deployments',
          [FIXTURE_VALUE_KEY]: 20,
        },
        {
          datafileRevision: '6',
          flagClientName: 'api-builds',
          [FIXTURE_VALUE_KEY]: 4,
        },
      ],
    });
    client.setArgv(
      'flags',
      'evaluations',
      'my-feature',
      '--group-by',
      'datafile-revision',
      '--group-by',
      'client',
      '--since',
      '2026-07-10T10:00:00.000Z',
      '--until',
      '2026-07-10T11:00:00.000Z',
      '--granularity',
      '1h',
      '--json'
    );

    const exitCode = await flags(client);

    expect(exitCode).toBe(0);
    expect(postedBody).toMatchObject({
      groupBy: ['datafileRevision', 'flagClientName'],
      filter: 'flagKey:"my-feature"',
    });
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.groupBy).toEqual(['datafile-revision', 'client']);
    expect(json.buckets).toEqual([
      {
        timestamp: '2026-07-10T10:00:00.000Z',
        datafileRevision: '7',
        clientName: 'api-deployments',
        evaluations: 20,
      },
      {
        timestamp: '2026-07-10T10:00:00.000Z',
        datafileRevision: '6',
        clientName: 'api-builds',
        evaluations: 4,
      },
    ]);
  });

  it('falls back to SDK key hashes when the SDK keys lookup fails', async () => {
    sdkKeysLookupFailure = {
      status: 403,
      code: 'forbidden',
      message: 'Not authorized to list SDK keys.',
    };
    useEvaluationsResponse({
      data: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          sdkKeyId: 'sdk_key_abc123',
          [FIXTURE_VALUE_KEY]: 20,
        },
      ],
      summary: [{ sdkKeyId: 'sdk_key_abc123', [FIXTURE_VALUE_KEY]: 20 }],
    });
    client.setArgv(
      'flags',
      'evaluations',
      '--group-by',
      'sdk-key',
      '--since',
      '2026-07-10T10:00:00.000Z',
      '--until',
      '2026-07-10T11:00:00.000Z'
    );

    expect(await flags(client)).toBe(0);
    expect(postedBody).toMatchObject({ groupBy: ['sdkKeyId'] });
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Could not load SDK key labels; SDK keys are shown as hashes.'
    );
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      'sdk_key_abc123 (unknown or deleted key)'
    );
  });

  it('keeps JSON stdout and stderr clean when the SDK keys lookup fails', async () => {
    sdkKeysLookupFailure = {
      status: 403,
      code: 'forbidden',
      message: 'Not authorized to list SDK keys.',
    };
    useEvaluationsResponse({
      data: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          sdkKeyId: 'sdk_key_abc123',
          [FIXTURE_VALUE_KEY]: 20,
        },
      ],
      summary: [{ sdkKeyId: 'sdk_key_abc123', [FIXTURE_VALUE_KEY]: 20 }],
    });
    client.setArgv(
      'flags',
      'evaluations',
      '--group-by',
      'sdk-key',
      '--since',
      '2026-07-10T10:00:00.000Z',
      '--until',
      '2026-07-10T11:00:00.000Z',
      '--json'
    );

    expect(await flags(client)).toBe(0);
    expect(client.stderr.getFullOutput()).not.toContain(
      'Could not load SDK key labels'
    );
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json.buckets).toEqual([
      {
        timestamp: '2026-07-10T10:00:00.000Z',
        sdkKeyId: 'sdk_key_abc123',
        sdkKeyLabel: null,
        sdkKeyEnvironment: null,
        evaluations: 20,
      },
    ]);
  });

  it('strips escape sequences and control characters from reported group values', async () => {
    const hostileClient = 'api-\u001b[31mred\u001b[0m\nnext-line\u0007';
    useEvaluationsResponse({
      data: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          flagClientName: hostileClient,
          [FIXTURE_VALUE_KEY]: 20,
        },
      ],
      summary: [{ flagClientName: hostileClient, [FIXTURE_VALUE_KEY]: 20 }],
    });
    client.setArgv(
      'flags',
      'evaluations',
      '--group-by',
      'client',
      '--since',
      '2026-07-10T10:00:00.000Z',
      '--until',
      '2026-07-10T11:00:00.000Z'
    );

    expect(await flags(client)).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('api-rednext-line');
    expect(stdout).not.toContain('\u001b[31m');
    expect(stdout).not.toContain('\u0007');
  });

  it('truncates by composite group key when grouping by several dimensions', async () => {
    const groups = Array.from({ length: 101 }, (_, index) => ({
      sdkKeyId: `key-${index % 2}`,
      flagClientName: `client-${index}`,
    }));
    useEvaluationsResponse({
      summary: groups.map((group, index) => ({
        ...group,
        [FIXTURE_VALUE_KEY]: groups.length - index,
      })),
      data: [
        // Key from a visible group, client from the dropped 101st group.
        // Only a filter on the full composite key removes this row.
        { sdkKeyId: 'key-1', flagClientName: 'client-100' },
        groups[100],
        groups[1],
      ].map((group, index) => ({
        timestamp: '2026-07-10T10:00:00.000Z',
        ...group,
        [FIXTURE_VALUE_KEY]: index + 1,
      })),
    });
    client.setArgv(
      'flags',
      'evaluations',
      '--group-by',
      'sdk-key',
      '--group-by',
      'client',
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
      json.buckets.map(
        (bucket: { sdkKeyId: string; clientName: string }) =>
          `${bucket.sdkKeyId}/${bucket.clientName}`
      )
    ).toEqual(['key-1/client-1']);
  });

  it('rejects grouping by variant without a flag', async () => {
    client.setArgv('flags', 'evaluations', '--group-by', 'variant');

    const exitCode = await flags(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Grouping by variant needs a flag'
    );
  });

  it('rejects an unknown group-by dimension', async () => {
    client.setArgv(
      'flags',
      'evaluations',
      'my-feature',
      '--group-by',
      'region'
    );

    const exitCode = await flags(client);

    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Invalid group-by dimension "region". Use one of: variant, flag, sdk-key, client, environment, reason, datafile-revision.'
    );
  });

  it('returns API failures as JSON errors', async () => {
    client.scenario.post('/metrics/v1', (_req, res) => {
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
        message: 'Not allowed',
        hint: expect.stringContaining('ask a team owner'),
        retryable: false,
        userActionRequired: true,
        scope: expect.any(String),
      },
    });
    expect(client.stdout.getFullOutput()).not.toContain('team_dummy');
    expect(client.stderr.getFullOutput()).not.toContain('Not allowed');
  });

  it('names the missing flags permission on a generic 403', async () => {
    client.scenario.post('/metrics/v1', (_req, res) => {
      res.status(403).json({
        error: { code: 'forbidden', message: 'Forbidden' },
      });
    });
    client.setArgv('flags', 'evaluations', 'my-feature', '--json');

    expect(await flags(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput()).error).toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining('read feature flags'),
    });
  });

  it('rejects projects owned by a personal account', async () => {
    client.reset();
    useUser({ id: 'user_123' });
    useProject({
      ...defaultProject,
      id: 'prj_personal',
      name: 'personal-project',
      accountId: 'user_123',
    });
    const cwd = setupTmpDir();
    await outputJSON(join(cwd, '.vercel/project.json'), {
      orgId: 'user_123',
      projectId: 'prj_personal',
    });
    client.cwd = cwd;
    useEvaluationsResponse();
    client.setArgv('flags', 'evaluations', 'my-feature', '--json');

    expect(await flags(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput()).error).toMatchObject({
      code: 'MISSING_SCOPE',
      message: expect.stringContaining('team-owned projects only'),
    });
    expect(postedBody).toBeUndefined();
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

      expect(exitCode).toBe(0);
      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        'Display evaluation metrics for a feature flag'
      );
      expect(stripAnsi(client.stderr.getFullOutput())).toContain('--since');
      expect(stripAnsi(client.stderr.getFullOutput())).toContain('--json');
      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        '1m, 5m, 15m, 1h, 4h, 1d'
      );
      expect(stripAnsi(client.stderr.getFullOutput())).not.toContain(
        '--format'
      );
      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        '--group-by <DIM>'
      );
      expect(stripAnsi(client.stderr.getFullOutput())).toContain('sdk-key');
      expect(stripAnsi(client.stderr.getFullOutput())).not.toContain(
        '--filter'
      );
      expect(stripAnsi(client.stderr.getFullOutput())).not.toContain('--limit');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'flags:evaluations' },
      ]);
    });
  });
});
