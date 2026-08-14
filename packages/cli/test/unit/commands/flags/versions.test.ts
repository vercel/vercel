import { describe, it, expect, beforeEach } from 'vitest';
import stripAnsi from 'strip-ansi';
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
  defaultFlagVersions,
  defaultFlags,
  useFlags,
} from '../../../mocks/flags';
import type { Flag, FlagVersion } from '../../../../src/util/flags/types';

describe('flags versions', () => {
  let flagsList: Flag[];
  let versionsList: FlagVersion[];

  beforeEach(() => {
    flagsList = JSON.parse(JSON.stringify(defaultFlags)) as Flag[];
    versionsList = JSON.parse(
      JSON.stringify(defaultFlagVersions)
    ) as FlagVersion[];
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
      accountId: 'team_dummy',
    });
    useFlags(
      flagsList,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      versionsList
    );
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
  });

  it('prints help for the versions diff subcommand and tracks telemetry', async () => {
    client.setArgv('flags', 'versions', 'diff', '--help');
    const exitCode = await flags(client);

    expect(exitCode).toEqual(2);
    const output = client.stderr.getFullOutput();
    expect(output).toContain(
      'Show changes introduced by a feature flag version'
    );
    expect(output).toContain('--revision <NUMBER>');
    expect(output).not.toContain('Missing required argument');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:versions', value: 'versions' },
      { key: 'flag:help', value: 'flags versions:diff' },
    ]);
  });

  it('tracks the default versions list subcommand and options', async () => {
    client.setArgv(
      'flags',
      'versions',
      'my-feature',
      '--environment',
      'production',
      '--limit',
      '1',
      '--cursor',
      '1',
      '--json'
    );
    await flags(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:versions', value: 'versions' },
      { key: 'subcommand:list', value: 'default' },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'option:environment', value: 'production' },
      { key: 'option:limit', value: '1' },
      { key: 'option:cursor', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it.each([
    'list',
    'ls',
  ])('tracks the explicit versions %s subcommand', async subcommand => {
    client.setArgv(
      'flags',
      'versions',
      subcommand,
      'my-feature',
      '--limit',
      '1'
    );
    await flags(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:versions', value: 'versions' },
      { key: 'subcommand:list', value: subcommand },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'option:limit', value: '1' },
    ]);
  });

  it('redacts custom environments in telemetry', async () => {
    client.setArgv(
      'flags',
      'versions',
      'my-feature',
      '--environment',
      'customer-preview'
    );
    await flags(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:versions', value: 'versions' },
      { key: 'subcommand:list', value: 'default' },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'option:environment', value: '[REDACTED]' },
    ]);
  });

  it('tracks versions diff subcommand and options', async () => {
    client.setArgv(
      'flags',
      'versions',
      'diff',
      'my-feature',
      '--revision',
      '3',
      '--project',
      'vercel-flags-test',
      '--json'
    );
    await flags(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:versions', value: 'versions' },
      { key: 'subcommand:diff', value: 'diff' },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'option:project', value: '[REDACTED]' },
      { key: 'option:revision', value: '3' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('prints version history in a table', async () => {
    client.setArgv('flags', 'versions', 'my-feature', '--limit', '1');
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Revision');
    expect(output).toContain('Author');
    expect(output).toContain('Message');
    expect(output).toContain('Timestamp');
    expect(output).toContain('Changed Environments');
    expect(output).toContain('Ada Lovelace');
    expect(output).toContain('Enabled production rollout');
    expect(output).toContain('production');
    expect(output).toContain('flags versions my-feature --limit 1 --cursor 1');
  });

  it('quotes values with shell metacharacters in the next-page command', async () => {
    flagsList[0].slug = 'my feature';
    versionsList.unshift({
      ...JSON.parse(JSON.stringify(versionsList[0])),
      id: 'flag_version_custom_env',
      revision: 4,
      changedEnvironments: ['custom preview'],
    });
    versionsList.unshift({
      ...JSON.parse(JSON.stringify(versionsList[0])),
      id: 'flag_version_custom_env_2',
      revision: 5,
      changedEnvironments: ['custom preview'],
    });

    client.setArgv(
      'flags',
      'versions',
      'my feature',
      '--environment',
      'custom preview',
      '--limit',
      '1'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain(
      "flags versions 'my feature' --limit 1 --environment 'custom preview' --cursor 1"
    );
  });

  it('outputs version history as JSON', async () => {
    client.setArgv('flags', 'versions', 'my-feature', '--json');
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.versions).toHaveLength(3);
    expect(parsed.versions[0]).toMatchObject({
      id: 'flag_version_3',
      flagId: 'flag_abc123',
      revision: 3,
      author: 'Ada Lovelace',
      createdBy: 'user_456',
      message: 'Enabled production rollout',
      changedEnvironments: ['production'],
      data: {
        variants: defaultFlags[0].variants,
        environments: defaultFlags[0].environments,
      },
    });
    expect(parsed.pagination.next).toBeNull();
  });

  it('prints Flag created for revision 0 without a message', async () => {
    const revision0 = JSON.parse(
      JSON.stringify(versionsList.find(version => version.revision === 1))
    ) as FlagVersion;
    revision0.id = 'flag_version_0';
    revision0.revision = 0;
    revision0.changedEnvironments = [];
    delete revision0.message;
    versionsList.push(revision0);

    client.setArgv('flags', 'versions', 'my-feature');
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('Flag created');
  });

  it('outputs Flag created for revision 0 JSON message', async () => {
    const revision0 = JSON.parse(
      JSON.stringify(versionsList.find(version => version.revision === 1))
    ) as FlagVersion;
    revision0.id = 'flag_version_0';
    revision0.revision = 0;
    revision0.changedEnvironments = [];
    delete revision0.message;
    versionsList.push(revision0);

    client.setArgv('flags', 'versions', 'my-feature', '--json');
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(
      parsed.versions.find(
        (version: { revision: number }) => version.revision === 0
      ).message
    ).toEqual('Flag created');
  });

  it('prints a version diff', async () => {
    const version = versionsList.find(version => version.revision === 3);
    const previousVersion = versionsList.find(
      version => version.revision === 2
    );
    expect(version).toBeDefined();
    expect(previousVersion).toBeDefined();
    version!.data.environments.production.revision = 3;
    previousVersion!.data.environments.production.revision = 2;
    previousVersion!.data.environments.production.rules = [];

    client.setArgv(
      'flags',
      'versions',
      'diff',
      'my-feature',
      '--revision',
      '3'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('Changes in revision 3');
    expect(output).toContain('compared with revision 2');
    expect(output).toContain('Changed environments: production');
    expect(output).not.toContain('environments.production.revision');
    expect(output).not.toContain('environments.production.rules');
    expect(output).not.toContain('+ [');
    expect(output).toContain('Production');
    expect(output).toContain('Rules');
    expect(output).toContain('+ rule_1');
    expect(output).toContain('→ On');
    expect(output).toContain('if user.plan is pro');
    expect(output).toContain('rule_1');
  });

  it('compares revision 1 with creation revision 0', async () => {
    const revision1 = versionsList.find(version => version.revision === 1);
    expect(revision1).toBeDefined();
    const revision0 = JSON.parse(JSON.stringify(revision1)) as FlagVersion;
    revision0.id = 'flag_version_0';
    revision0.revision = 0;
    revision0.message = undefined;
    revision0.changedEnvironments = [];
    revision0.data.description = 'Created description';
    delete revision0.data.permanent;
    revision1!.data.description = 'Updated description';
    revision1!.data.permanent = false;
    versionsList.push(revision0);

    client.setArgv(
      'flags',
      'versions',
      'diff',
      'my-feature',
      '--revision',
      '1'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('compared with revision 0');
    expect(output).toContain('Created description');
    expect(output).toContain('Updated description');
    expect(output).not.toContain('Permanent');
  });

  it('finds a revision pair split across pagination pages', async () => {
    replaceWithVersionHistory(versionsList, 201);
    const version = versionsList.find(candidate => candidate.revision === 101);
    const previousVersion = versionsList.find(
      candidate => candidate.revision === 100
    );
    expect(version).toBeDefined();
    expect(previousVersion).toBeDefined();
    version!.data.description = 'After page boundary';
    previousVersion!.data.description = 'Before page boundary';

    client.setArgv(
      'flags',
      'versions',
      'diff',
      'my-feature',
      '--revision',
      '101'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('compared with revision 100');
    expect(output).toContain('Before page boundary');
    expect(output).toContain('After page boundary');
  });

  it('reports no semantic changes instead of printing an empty diff', async () => {
    const version = versionsList.find(candidate => candidate.revision === 3);
    const previousVersion = versionsList.find(
      candidate => candidate.revision === 2
    );
    expect(version).toBeDefined();
    expect(previousVersion).toBeDefined();
    version!.data.tags = ['checkout', 'experiment'];
    previousVersion!.data.tags = ['experiment', 'checkout'];

    client.setArgv(
      'flags',
      'versions',
      'diff',
      'my-feature',
      '--revision',
      '3'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'No changes detected.'
    );
  });

  it('outputs a version diff as JSON', async () => {
    const previousVersion = versionsList.find(
      version => version.revision === 2
    );
    expect(previousVersion).toBeDefined();
    previousVersion!.data.environments.production.rules = [];

    client.setArgv(
      'flags',
      'versions',
      'diff',
      'my-feature',
      '--revision',
      '3',
      '--json'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed).toMatchObject({
      flag: 'my-feature',
      revision: 3,
      previousRevision: 2,
    });
    expect(parsed.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'environments.production.rules',
          action: 'changed',
          before: [],
          after: expect.arrayContaining([
            expect.objectContaining({ id: 'rule_1' }),
          ]),
        }),
      ])
    );
  });

  it('filters versions by changed environment', async () => {
    client.setArgv(
      'flags',
      'versions',
      'my-feature',
      '--environment',
      'preview',
      '--json'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(
      parsed.versions.map((version: { revision: number }) => version.revision)
    ).toEqual([2, 1]);
  });

  it('resumes from a cursor', async () => {
    client.setArgv(
      'flags',
      'versions',
      'my-feature',
      '--limit',
      '1',
      '--cursor',
      '1',
      '--json'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.versions).toHaveLength(1);
    expect(parsed.versions[0].revision).toEqual(2);
    expect(parsed.pagination.next).toEqual('2');
  });

  it('lists versions with --project when the cwd is not linked', async () => {
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    removeProjectLink(cwd);
    client.cwd = cwd;

    client.setArgv(
      'flags',
      'versions',
      'my-feature',
      '--project',
      'vercel-flags-test',
      '--json'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(JSON.parse(client.stdout.getFullOutput()).versions).toHaveLength(3);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:versions', value: 'versions' },
      { key: 'subcommand:list', value: 'default' },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'option:project', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('returns an error when the flag argument is missing', async () => {
    client.setArgv('flags', 'versions');
    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required argument: flag'
    );
  });

  it('rejects a --limit below 1', async () => {
    client.setArgv('flags', 'versions', 'my-feature', '--limit', '0');
    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'The --limit option must be an integer between 1 and 100.'
    );
  });

  it('rejects versions diff without a revision', async () => {
    client.setArgv('flags', 'versions', 'diff', 'my-feature');
    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'The --revision option must be a non-negative integer.'
    );
  });

  it('rejects versions diff for revision 0', async () => {
    client.setArgv(
      'flags',
      'versions',
      'diff',
      'my-feature',
      '--revision',
      '0'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Revision 0 has no previous revision to compare.'
    );
  });

  it('mentions available revision count when the requested revision is missing', async () => {
    client.setArgv(
      'flags',
      'versions',
      'diff',
      'my-feature',
      '--revision',
      '99'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain(
      'Only 3 revisions are available. Revision 99 was not found for my-feature'
    );
  });

  it('uses singular wording for one available revision', async () => {
    client.setArgv(
      'flags',
      'versions',
      'diff',
      'another-feature',
      '--revision',
      '99'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain(
      'Only 1 revision is available. Revision 99 was not found'
    );
  });

  it('counts available revisions across pagination pages', async () => {
    replaceWithVersionHistory(versionsList, 201);

    client.setArgv(
      'flags',
      'versions',
      'diff',
      'my-feature',
      '--revision',
      '999'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain(
      'Only 201 revisions are available. Revision 999 was not found'
    );
  });
});

function replaceWithVersionHistory(
  versions: FlagVersion[],
  revisionCount: number
) {
  const template = versions.find(version => version.flagId === 'flag_abc123');
  expect(template).toBeDefined();

  const history = Array.from({ length: revisionCount }, (_, index) => {
    const revision = revisionCount - index - 1;
    const version = JSON.parse(JSON.stringify(template)) as FlagVersion;
    version.id = `flag_version_${revision}`;
    version.revision = revision;
    version.createdAt = revision;
    version.message = revision === 0 ? undefined : `Revision ${revision}`;
    return version;
  });

  versions.splice(0, versions.length, ...history);
}
