import { describe, expect, it } from 'vitest';
import { client } from '../../mocks/client';
import secrets from '../../../src/commands/secrets';
import { useSecrets } from '../../mocks/secrets';
import { useUser } from '../../mocks/user';
import { useTeams } from '../../mocks/team';
import ms from 'ms';

describe('secrets', () => {
  it('errors when no subcommand is provided', async () => {
    client.setArgv('secrets');
    const exitCode = await secrets(client);

    expect(exitCode).toEqual(2);
  });

  it('lists secrets with ls subcommand', async () => {
    useUser();
    useTeams('team_dummy');
    const name = 'secret-api-password';
    const created = 1519555701;
    useSecrets({ name, created });

    client.setArgv('secrets', 'ls');
    await secrets(client);

    const timeAgo = `${ms(
      new Date().getTime() - new Date(created).getTime()
    )} ago`;
    await expect(client.stderr).toOutput(
      '> NOTE: The `vercel env ls` command is recommended instead of `vercel secret ls`'
    );

    const output = client.stderr.read();
    await expect(output).toMatch(name);
    await expect(output).toMatch(timeAgo);
  });
});
