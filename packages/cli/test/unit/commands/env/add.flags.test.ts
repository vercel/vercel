import { describe, expect, it, beforeEach } from 'vitest';
import env from '../../../../src/commands/env';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, envs, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('env add (flags)', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject(
      {
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      },
      envs
    );
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
  });

  it('adds an env without prompts using flags', async () => {
    client.setArgv(
      'env',
      'add',
      'FLAG_TEST',
      '--target',
      'development',
      '--value',
      'abc123',
      '--non-interactive'
    );
    const exitCodePromise = env(client);
    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput(
      'Added Environment Variable FLAG_TEST to Project vercel-env-pull'
    );
  });
});
