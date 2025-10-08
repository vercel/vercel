import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { parse } from 'dotenv';
import env from '../../../../src/commands/env';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, envs, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('env pull', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'env';
      const subcommand = 'pull';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = env(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('should handle pulling', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-env-pull',
      name: 'vercel-env-pull',
    });
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
    client.setArgv('env', 'pull', '--yes');
    const exitCodePromise = env(client);
    await expect(client.stderr).toOutput(
      'Downloading `development` Environment Variables for'
    );
    await expect(client.stderr).toOutput(
      'Created .env.local file and added it to .gitignore'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "env"').toEqual(0);

    const rawDevEnv = await fs.readFile(path.join(cwd, '.env.local'));

    // check for development env value
    const devFileHasDevEnv = rawDevEnv.toString().includes('SPECIAL_FLAG');
    expect(devFileHasDevEnv).toBeTruthy();

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: `subcommand:pull`,
        value: 'pull',
      },
      {
        key: `flag:yes`,
        value: 'TRUE',
      },
    ]);
  });

  it('should handle pulling from Preview env vars', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-env-pull',
      name: 'vercel-env-pull',
    });
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
    client.setArgv('env', 'pull', '--yes', '--environment', 'preview');
    const exitCodePromise = env(client);
    await expect(client.stderr).toOutput(
      'Downloading `preview` Environment Variables for'
    );
    await expect(client.stderr).toOutput(
      'Created .env.local file and added it to .gitignore'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "env"').toEqual(0);

    // check for Preview env vars
    const rawDevEnv = await fs.readFile(path.join(cwd, '.env.local'), 'utf8');
    expect(rawDevEnv).toContain(
      'REDIS_CONNECTION_STRING="redis://abc123@redis.example.com:6379"'
    );
    expect(rawDevEnv).not.toContain(
      'BRANCH_ENV_VAR="env var for a specific branch"'
    );
  });

  it('should handle pulling from specific Git branch', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-env-pull',
      name: 'vercel-env-pull',
    });
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
    client.setArgv(
      'env',
      'pull',
      '--yes',
      '--environment',
      'preview',
      '--git-branch',
      'feat/awesome-thing'
    );
    const exitCodePromise = env(client);
    await expect(client.stderr).toOutput(
      'Downloading `preview` Environment Variables for'
    );
    await expect(client.stderr).toOutput(
      'Created .env.local file and added it to .gitignore'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "env"').toEqual(0);

    // check for Preview env vars
    const rawDevEnv = await fs.readFile(path.join(cwd, '.env.local'), 'utf8');
    expect(rawDevEnv).toContain(
      'REDIS_CONNECTION_STRING="redis://abc123@redis.example.com:6379"'
    );
    expect(rawDevEnv).toContain(
      'BRANCH_ENV_VAR="env var for a specific branch"'
    );

    const parsed = parse(rawDevEnv);
    const keys = Object.keys(parsed);
    expect(keys).toHaveLength(3);
    expect(keys[0]).toEqual('ANOTHER');
    expect(keys[1]).toEqual('BRANCH_ENV_VAR');
    expect(keys[2]).toEqual('REDIS_CONNECTION_STRING');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: `subcommand:pull`,
        value: 'pull',
      },
      {
        key: `flag:yes`,
        value: 'TRUE',
      },
      {
        key: `option:git-branch`,
        value: '[REDACTED]',
      },
      {
        key: 'option:environment',
        value: 'preview',
      },
    ]);
  });

  it('should handle alternate filename', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-env-pull',
      name: 'vercel-env-pull',
    });
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
    client.setArgv('env', 'pull', 'other.env', '--yes');
    const exitCodePromise = env(client);
    await expect(client.stderr).toOutput(
      'Downloading `development` Environment Variables for'
    );
    await expect(client.stderr).toOutput('Created other.env file');
    await expect(client.stderr).not.toOutput('and added it to .gitignore');
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "env"').toEqual(0);

    const rawDevEnv = await fs.readFile(path.join(cwd, 'other.env'));

    // check for development env value
    const devFileHasDevEnv = rawDevEnv.toString().includes('SPECIAL_FLAG');
    expect(devFileHasDevEnv).toBeTruthy();

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: `subcommand:pull`,
        value: 'pull',
      },
      {
        key: `argument:filename`,
        value: '[REDACTED]',
      },
      {
        key: `flag:yes`,
        value: 'TRUE',
      },
    ]);
  });

  it('should use given environment', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-env-pull',
      name: 'vercel-env-pull',
    });
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
    client.setArgv('env', 'pull', '--environment', 'production');
    const exitCodePromise = env(client);
    await expect(client.stderr).toOutput(
      `Downloading \`production\` Environment Variables for`
    );
    await expect(client.stderr).toOutput(
      'Created .env.local file and added it to .gitignore'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "env"').toEqual(0);

    const rawProdEnv = await fs.readFile(path.join(cwd, '.env.local'));

    // check for development env value
    const envFileHasEnv = rawProdEnv
      .toString()
      .includes('REDIS_CONNECTION_STRING');
    expect(envFileHasEnv).toBeTruthy();
  });

  it('should expose production system env variables', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-env-pull',
      name: 'vercel-env-pull',
      autoExposeSystemEnvs: true,
    });
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
    client.setArgv(
      'env',
      'pull',
      'other.env',
      '--yes',
      '--environment',
      'production'
    );
    const exitCodePromise = env(client);
    await expect(client.stderr).toOutput(
      'Downloading `production` Environment Variables for'
    );
    await expect(client.stderr).toOutput('Created other.env file');
    await expect(client.stderr).not.toOutput('and added it to .gitignore');
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "env"').toEqual(0);

    const rawDevEnv = await fs.readFile(path.join(cwd, 'other.env'));

    const productionFileHasVercelEnv = rawDevEnv
      .toString()
      .includes('VERCEL_ENV="production"');
    expect(productionFileHasVercelEnv).toBeTruthy();
  });

  it('should not expose system env variables in dev', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-env-pull',
      name: 'vercel-env-pull',
      autoExposeSystemEnvs: true,
    });
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
    client.setArgv('env', 'pull', 'other.env', '--yes');
    const exitCodePromise = env(client);
    await expect(client.stderr).toOutput(
      'Downloading `development` Environment Variables for'
    );
    await expect(client.stderr).toOutput('Created other.env file');
    await expect(client.stderr).not.toOutput('and added it to .gitignore');
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "env"').toEqual(0);

    const devEnv = (await fs.readFile(path.join(cwd, 'other.env'))).toString();

    const devFileHasVercelEnv = [
      'VERCEL',
      'VERCEL_ENV',
      'VERCEL_URL',
      'VERCEL_REGION',
      'VERCEL_DEPLOYMENT_ID',
    ].some(envVar => devEnv.includes(envVar));
    expect(devFileHasVercelEnv).toBeFalsy();
  });

  it('should show a delta string', async () => {
    const cwd = setupUnitFixture('vercel-env-pull-delta');
    client.cwd = cwd;
    try {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'env-pull-delta',
        name: 'env-pull-delta',
      });

      client.setArgv('env', 'add', 'NEW_VAR');
      const addPromise = env(client);

      await expect(client.stderr).toOutput("What's the value of NEW_VAR?");
      client.stdin.write('testvalue\n');

      await expect(client.stderr).toOutput(
        'Add NEW_VAR to which Environments (select multiple)?'
      );
      client.stdin.write('\x1B[B'); // Down arrow
      client.stdin.write('\x1B[B');
      client.stdin.write(' ');
      client.stdin.write('\r');

      await expect(addPromise).resolves.toEqual(0);

      client.setArgv('env', 'pull', '--yes');
      const pullPromise = env(client);
      await expect(client.stderr).toOutput(
        'Downloading `development` Environment Variables for'
      );
      await expect(client.stderr).toOutput(
        '+ SPECIAL_FLAG (Updated)\n+ NEW_VAR\n- TEST\n'
      );
      await expect(client.stderr).toOutput(
        'Updated .env.local file and added it to .gitignore'
      );

      await expect(pullPromise).resolves.toEqual(0);
    } finally {
      client.setArgv('env', 'rm', 'NEW_VAR', '--yes');
      await env(client);
    }
  });

  it('should not show a delta string when it fails to read a file', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'env-pull-delta-corrupt',
      name: 'env-pull-delta-corrupt',
    });
    const cwd = setupUnitFixture('vercel-env-pull-delta-corrupt');
    client.cwd = cwd;
    client.setArgv('env', 'pull', '--yes');
    const pullPromise = env(client);
    await expect(client.stderr).toOutput(
      'Updated .env.local file and added it to .gitignore'
    );
    await expect(pullPromise).resolves.toEqual(0);
  });

  it('should show that no changes were found', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'env-pull-delta-no-changes',
      name: 'env-pull-delta-no-changes',
    });
    client.cwd = setupUnitFixture('vercel-env-pull-delta-no-changes');
    client.setArgv('env', 'pull', '--yes');
    const pullPromise = env(client);
    await expect(client.stderr).toOutput('> No changes found.');
    await expect(client.stderr).toOutput(
      'Updated .env.local file and added it to .gitignore'
    );
    await expect(pullPromise).resolves.toEqual(0);
  });

  it('should correctly render delta string when env variable has quotes', async () => {
    const cwd = setupUnitFixture('vercel-env-pull-delta-quotes');
    client.cwd = cwd;
    try {
      useUser();
      useTeams('team_dummy');
      useProject(
        {
          ...defaultProject,
          id: 'env-pull-delta-quotes',
          name: 'env-pull-delta-quotes',
        },
        [
          ...envs,
          {
            type: 'encrypted',
            id: '781dt89g8r2h789g',
            key: 'NEW_VAR',
            value: '"testvalue"',
            target: ['development'],
            configurationId: null,
            updatedAt: 1557241361455,
            createdAt: 1557241361455,
          },
        ]
      );

      client.setArgv('env', 'pull', '--yes');
      const pullPromise = env(client);
      await expect(client.stderr).toOutput(
        'Downloading `development` Environment Variables for'
      );
      await expect(client.stderr).toOutput('No changes found.\n');
      await expect(client.stderr).toOutput(
        'Updated .env.local file and added it to .gitignore'
      );

      await expect(pullPromise).resolves.toEqual(0);
    } finally {
      client.setArgv('env', 'rm', 'NEW_VAR', '--yes');
      await env(client);
    }
  });

  it('should correctly render delta string when local env variable has quotes', async () => {
    const cwd = setupUnitFixture('vercel-env-pull-delta-quotes');
    client.cwd = cwd;
    try {
      useUser();
      useTeams('team_dummy');
      useProject(
        {
          ...defaultProject,
          id: 'env-pull-delta-quotes',
          name: 'env-pull-delta-quotes',
        },
        [
          ...envs,
          {
            type: 'encrypted',
            id: '781dt89g8r2h789g',
            key: 'NEW_VAR',
            value: 'testvalue',
            target: ['development'],
            configurationId: null,
            updatedAt: 1557241361455,
            createdAt: 1557241361455,
          },
        ]
      );

      client.setArgv('env', 'pull', '.env.testquotes', '--yes');
      const pullPromise = env(client);
      await expect(client.stderr).toOutput(
        'Downloading `development` Environment Variables for'
      );
      await expect(client.stderr).toOutput('No changes found.\n');
      await expect(client.stderr).toOutput('Updated .env.testquotes file');

      await expect(pullPromise).resolves.toEqual(0);
    } finally {
      client.setArgv('env', 'rm', 'NEW_VAR', '--yes');
      await env(client);
    }
  });

  it('should not update .gitignore if it contains a match', async () => {
    const prj = 'vercel-env-pull-with-gitignore';
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: prj,
      name: prj,
    });
    const cwd = setupUnitFixture(prj);
    const gitignoreBefore = await fs.readFile(
      path.join(cwd, '.gitignore'),
      'utf8'
    );
    client.cwd = cwd;
    client.setArgv('env', 'pull', '--yes');
    const exitCodePromise = env(client);
    await expect(client.stderr).toOutput(
      'Downloading `development` Environment Variables for'
    );
    await expect(client.stderr).toOutput('Created .env.local file');
    await expect(client.stderr).not.toOutput('and added it to .gitignore');
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "env"').toEqual(0);

    const rawDevEnv = await fs.readFile(path.join(cwd, '.env.local'));

    // check for development env value
    const devFileHasDevEnv = rawDevEnv.toString().includes('SPECIAL_FLAG');
    expect(devFileHasDevEnv).toBeTruthy();

    const gitignoreAfter = await fs.readFile(
      path.join(cwd, '.gitignore'),
      'utf8'
    );
    expect(gitignoreAfter).toBe(gitignoreBefore);
  });

  it('should not pull VERCEL_ANALYTICS_ID', async () => {
    useUser();
    useTeams('team_dummy');
    useProject(
      {
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
        analytics: {
          id: 'VC-ANALYTICS-ID',
          enabledAt: Date.now(),
        },
      },
      [
        {
          type: 'encrypted',
          id: '781dt89g8r2h789g',
          key: 'VERCEL_ANALYTICS_ID',
          value: 'VC-ANALYTICS-ID',
          target: ['development'],
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        },
      ]
    );
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
    client.setArgv('env', 'pull', '--yes');
    const exitCodePromise = env(client);
    await expect(client.stderr).toOutput(
      'Downloading `development` Environment Variables for'
    );
    await expect(client.stderr).toOutput('Created .env.local file');
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "env"').toEqual(0);

    const rawDevEnv = await fs.readFile(path.join(cwd, '.env.local'));

    expect(rawDevEnv.toString().includes('VERCEL_ANALYTICS_ID')).toBeFalsy();
  });

  describe('[filename]', () => {
    it('tracks filename argument', async () => {
      const project = 'vercel-env-pull';
      useUser();
      useTeams('team_dummy');
      useProject({ ...defaultProject, id: project, name: project });
      client.setArgv('env', 'pull', 'testName');
      const cwd = setupUnitFixture(project);
      client.cwd = cwd;
      await env(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:pull', value: 'pull' },
        { key: 'argument:filename', value: '[REDACTED]' },
      ]);
    });
  });
});
