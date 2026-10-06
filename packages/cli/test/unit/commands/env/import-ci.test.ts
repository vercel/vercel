import fs from 'fs-extra';
import path from 'node:path';
import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it } from 'vitest';
import env from '../../../../src/commands/env';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

const project = {
  ...defaultProject,
  id: 'project-id',
  name: 'web',
  accountId: 'team_dummy',
  link: {
    type: 'github',
    org: 'acme',
    repo: 'web',
    repoId: 123,
    gitCredentialId: '',
    sourceless: false,
    createdAt: 1,
    updatedAt: 1,
  },
};

const sourceVariables = [
  {
    id: 'env-api-token',
    key: 'API_TOKEN',
    value: 'source-secret-value',
    type: 'sensitive' as const,
    visibility: 'secret' as const,
    target: ['production' as const],
    configurationId: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'env-api-url',
    key: 'API_URL',
    value: 'https://source.example',
    type: 'encrypted' as const,
    visibility: 'config' as const,
    target: ['production' as const],
    configurationId: null,
    createdAt: 1,
    updatedAt: 1,
  },
];

describe('env import-ci', () => {
  let requestBody: Record<string, unknown> | undefined;

  beforeEach(async () => {
    useUser();
    useTeams('team_dummy');
    useProject(project, sourceVariables);
    client.cwd = setupTmpDir();
    await fs.outputJSON(path.join(client.cwd, '.vercel', 'project.json'), {
      orgId: 'team_dummy',
      projectId: project.id,
    });
    await fs.outputJSON(path.join(client.cwd, '.vercel', 'repo.json'), {
      remoteName: 'origin',
      projects: [
        {
          id: project.id,
          name: project.name,
          directory: '.',
          orgId: 'team_dummy',
        },
      ],
    });

    client.scenario.get(`/v9/projects/${project.id}/env`, (req, res) => {
      expect(req.query.target).toBe('production');
      expect(req.query.teamId).toBe('team_dummy');
      res.json({ envs: sourceVariables });
    });
    client.scenario.get('/v1/env/ci/repository-variables', (req, res) => {
      expect(req.query).toMatchObject({
        provider: 'github',
        organizationId: 'acme',
        repository: 'web',
        teamId: 'team_dummy',
      });
      res.json([
        {
          key: 'API_TOKEN',
          visibility: 'secret',
          value: 'existing-secret-value',
        },
      ]);
    });
    client.scenario.post(
      '/v1/env/ci/repository-variables/import',
      (req, res) => {
        requestBody = req.body;
        res.json({
          imported: [{ key: 'API_URL', visibility: 'config' }],
          overwritten:
            req.body.conflictStrategy === 'overwrite'
              ? [{ key: 'API_TOKEN', visibility: 'secret' }]
              : [],
          skipped:
            req.body.conflictStrategy === 'skip'
              ? [{ key: 'API_TOKEN', reason: 'conflict' }]
              : [],
        });
      }
    );
  });

  it('imports selected keys and skips conflicts without printing values', async () => {
    client.setArgv(
      'env',
      'import-ci',
      'production',
      '--key',
      'API_TOKEN',
      '--key',
      'API_URL',
      '--yes'
    );

    await expect(env(client)).resolves.toBe(0);

    expect(requestBody).toEqual({
      provider: 'github',
      organizationId: 'acme',
      repository: 'web',
      sourceProjectId: 'project-id',
      target: 'production',
      keys: ['API_TOKEN', 'API_URL'],
      conflictStrategy: 'skip',
    });
    const output = stripAnsi(
      client.stderr.getFullOutput() + client.stdout.getFullOutput()
    );
    expect(output).toContain('✓ Imported');
    expect(output).toContain('API_URL (Config)');
    expect(output).toContain('API_TOKEN (Already exists)');
    expect(output).not.toContain('source-secret-value');
    expect(output).not.toContain('existing-secret-value');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:import-ci', value: 'import-ci' },
    ]);
  });

  it('prompts to overwrite conflicting variables', async () => {
    client.setArgv('env', 'import-ci', 'production', '--key', 'API_TOKEN');

    const result = env(client);
    await expect(client.stderr).toOutput('Existing variables?');
    client.stdin.write('\x1B[B\n');

    await expect(result).resolves.toBe(0);
    expect(requestBody?.conflictStrategy).toBe('overwrite');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'API_TOKEN (Secret)'
    );
  });

  it('prompts for the environment and keys', async () => {
    client.setArgv('env', 'import-ci');

    const result = env(client);
    await expect(client.stderr).toOutput('Environment?');
    client.stdin.write('\n');
    await expect(client.stderr).toOutput('Environment Variables?');
    client.stdin.write(' ');
    client.stdin.write('\n');
    await expect(client.stderr).toOutput('Existing variables?');
    client.stdin.write('\n');

    await expect(result).resolves.toBe(0);
    expect(requestBody).toMatchObject({
      target: 'production',
      keys: ['API_TOKEN'],
      conflictStrategy: 'skip',
    });
  });

  it('requires explicit environment and keys in non-interactive mode', async () => {
    client.nonInteractive = true;
    client.setArgv('env', 'import-ci', '--non-interactive');

    await expect(env(client)).resolves.toBe(1);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Specify an environment in non-interactive mode'
    );
    expect(requestBody).toBeUndefined();
  });

  it('overwrites conflicts with --force', async () => {
    client.setArgv(
      'env',
      'import-ci',
      'production',
      '--key',
      'API_TOKEN',
      '--force'
    );

    await expect(env(client)).resolves.toBe(0);
    expect(requestBody?.conflictStrategy).toBe('overwrite');
    expect(stripAnsi(client.stderr.getFullOutput())).not.toContain(
      'Existing variables?'
    );
  });
});
