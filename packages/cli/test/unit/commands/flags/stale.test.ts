import { describe, it, expect, beforeEach } from 'vitest';
import flags from '../../../../src/commands/flags';
import {
  removeProjectLink,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import {
  defaultFlagSettings,
  defaultFlags,
  defaultSdkKeys,
  defaultSegments,
  defaultStaleFlags,
  useFlags,
} from '../../../mocks/flags';
import type { StaleFlag } from '../../../../src/util/flags/types';

describe('flags stale', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
      accountId: 'team_dummy',
    });
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
  });

  it('tracks the stale subcommand and default options', async () => {
    useFlags();

    client.setArgv('flags', 'stale');
    await flags(client);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:stale',
        value: 'stale',
      },
      {
        key: 'option:stale-after',
        value: '30d',
      },
      {
        key: 'option:limit',
        value: '50',
      },
    ]);
  });

  it('tracks explicit stale pagination and output options', async () => {
    useFlags();

    client.setArgv(
      'flags',
      'stale',
      '--stale-after',
      '14d',
      '--limit',
      '1',
      '--next',
      'opaque-cursor',
      '--json'
    );
    await flags(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:stale',
        value: 'stale',
      },
      {
        key: 'option:stale-after',
        value: '14d',
      },
      {
        key: 'option:limit',
        value: '1',
      },
      {
        key: 'option:next',
        value: '[REDACTED]',
      },
      {
        key: 'flag:json',
        value: 'TRUE',
      },
    ]);
  });

  it('lists stale flags with --project when the cwd is not linked', async () => {
    useFlags();
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    removeProjectLink(cwd);
    client.cwd = cwd;

    client.setArgv(
      'flags',
      'stale',
      '--project',
      'vercel-flags-test',
      '--json'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(JSON.parse(client.stdout.getFullOutput()).flags).toHaveLength(2);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:stale', value: 'stale' },
      { key: 'option:project', value: '[REDACTED]' },
      { key: 'option:stale-after', value: '30d' },
      { key: 'option:limit', value: '50' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('lists stale flags successfully', async () => {
    useFlags();

    client.setArgv('flags', 'stale');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('2 stale feature flags found');
    expect(output).toContain('(past 30 days)');
    expect(output).not.toContain('Stale after:');
    expect(output).toContain('my-feature');
    expect(output).toContain('Unused');
    expect(output).toContain('another-feature');
    expect(output).toContain('Redundant');
    expect(output).toContain('Types');
    expect(output).toContain(
      'No production deployment references it, and it has no evaluations in the selected period.'
    );
    expect(output).toContain(
      'All configured and evaluated variants return the production default value.'
    );
  });

  it('returns one default page of 50 stale flags', async () => {
    useFlags(
      defaultFlags,
      defaultSdkKeys,
      defaultFlagSettings,
      defaultSegments,
      undefined,
      undefined,
      undefined,
      Array.from({ length: 65 }, (_, index) => createStaleFlag(index))
    );

    client.setArgv('flags', 'stale', '--json');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.staleAfter).toEqual('30d');
    expect(parsed.flags).toHaveLength(50);
    expect(parsed.flags[0].slug).toEqual('stale-0');
    expect(parsed.flags[0].reason).toEqual('unused');
    expect(parsed.flags[49].slug).toEqual('stale-49');
    expect(parsed.flags[49].reason).toEqual('redundant');
    expect(parsed.pagination.next).toEqual('50');
    expect(client.stdout.getFullOutput()).not.toContain('Types');
  });

  it('does not follow the next cursor automatically', async () => {
    useFlags(
      defaultFlags,
      defaultSdkKeys,
      defaultFlagSettings,
      defaultSegments,
      undefined,
      undefined,
      undefined,
      createSparseStaleCandidates()
    );

    client.setArgv('flags', 'stale', '--limit', '20', '--json');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.flags).toHaveLength(10);
    expect(parsed.flags[0].slug).toEqual('stale-0');
    expect(parsed.flags[0].reason).toEqual('unused');
    expect(parsed.flags[9].slug).toEqual('stale-18');
    expect(parsed.flags[9].reason).toEqual('unused');
    expect(parsed.pagination.next).toEqual('20');
  });

  it('prints the stale period when no stale flags are found', async () => {
    useFlags(
      defaultFlags,
      defaultSdkKeys,
      defaultFlagSettings,
      defaultSegments,
      undefined,
      undefined,
      undefined,
      []
    );

    client.setArgv('flags', 'stale', '--stale-after', '14d');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);

    const output = client.stderr.getFullOutput();
    expect(output).toContain('No stale feature flags found');
    expect(output).toContain('(past 14 days)');
    expect(output).not.toContain('Stale after:');
  });

  it('resumes from a --next cursor', async () => {
    useFlags(
      defaultFlags,
      defaultSdkKeys,
      defaultFlagSettings,
      defaultSegments,
      undefined,
      undefined,
      undefined,
      createSparseStaleCandidates()
    );

    client.setArgv('flags', 'stale', '--limit', '5', '--next', '20', '--json');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.flags).toHaveLength(5);
    expect(parsed.flags[0].slug).toEqual('stale-20');
    expect(parsed.flags[4].slug).toEqual('stale-24');
    expect(parsed.pagination.next).toEqual('25');
  });

  it('prints a next-page command preserving stale filters', async () => {
    useFlags();

    client.setArgv(
      'flags',
      'stale',
      '--project',
      'vercel-flags-test',
      '--stale-after',
      '14d',
      '--limit',
      '1'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'flags stale --project vercel-flags-test --stale-after 14d --limit 1 --next 1'
    );
  });

  it('quotes opaque cursors in the next-page command', async () => {
    client.scenario.get(
      '/v1/projects/:projectId/feature-flags/stale-flags',
      (_req, res) => {
        res.json({
          data: defaultStaleFlags.slice(0, 1),
          pagination: { next: 'cursor+value=' },
        });
      }
    );

    client.setArgv('flags', 'stale', '--limit', '1');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      "flags stale --limit 1 --next 'cursor+value='"
    );
  });

  it('prints unknown stale reason values from the API', async () => {
    useFlags(
      defaultFlags,
      defaultSdkKeys,
      defaultFlagSettings,
      defaultSegments,
      undefined,
      undefined,
      undefined,
      [{ slug: 'future-feature', reason: 'future' as StaleFlag['reason'] }]
    );

    client.setArgv('flags', 'stale');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('future-feature');
    expect(output).toContain('future');
  });

  it('rejects a --limit below 1', async () => {
    client.setArgv('flags', 'stale', '--limit', '0');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'The --limit option must be an integer between 1 and 100.'
    );
  });

  it('rejects a --limit above 100', async () => {
    client.setArgv('flags', 'stale', '--limit', '101');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'The --limit option must be an integer between 1 and 100.'
    );
  });

  it('rejects invalid --stale-after values', async () => {
    client.setArgv('flags', 'stale', '--stale-after', '30days');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'The --stale-after option must be a relative day duration like 14d.'
    );
  });

  it('rejects --stale-after values above 90d', async () => {
    client.setArgv('flags', 'stale', '--stale-after', '91d');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'The --stale-after option cannot exceed 90d.'
    );
  });
});

function createSparseStaleCandidates(): Array<StaleFlag | null> {
  return [
    ...Array.from({ length: 20 }, (_, index) =>
      index % 2 === 0 ? createStaleFlag(index) : null
    ),
    ...Array.from({ length: 15 }, (_, index) => createStaleFlag(index + 20)),
  ];
}

function createStaleFlag(index: number): StaleFlag {
  const base = defaultStaleFlags[index % defaultStaleFlags.length];
  return {
    ...base,
    slug: `stale-${index}`,
    reason: index % 2 === 0 ? 'unused' : 'redundant',
  };
}
