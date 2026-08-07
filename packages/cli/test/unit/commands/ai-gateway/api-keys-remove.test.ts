import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

function useDeleteApiKey(id = 'key_1') {
  client.scenario.delete(`/v1/api-keys/${id}`, (_req, res) => {
    res.status(204).end();
  });
}

function useDeleteNotFound(id = 'missing') {
  client.scenario.delete(`/v1/api-keys/${id}`, (_req, res) => {
    res
      .status(404)
      .json({ error: { code: 'not_found', message: 'API key not found.' } });
  });
}

describe('ai-gateway api-keys remove', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'api-keys', 'remove', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:api-keys', value: 'api-keys' },
        { key: 'flag:help', value: 'ai-gateway api-keys:remove' },
      ]);
    });
  });

  it('removes a key with --yes', async () => {
    const team = useTeam();
    useUser();
    useDeleteApiKey();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'rm', 'key_1', '--yes');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('removed');
    expect(await exitCodePromise).toBe(0);
  });

  it('removes a key via the delete alias', async () => {
    const team = useTeam();
    useUser();
    useDeleteApiKey();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'delete', 'key_1', '--yes');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('removed');
    expect(await exitCodePromise).toBe(0);
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useDeleteApiKey();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'api-keys',
      'rm',
      'key_1',
      '--yes',
      '--format',
      'json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"removed": true');
    expect(await exitCodePromise).toBe(0);
  });

  it('requires an id', async () => {
    useUser();
    client.setArgv('ai-gateway', 'api-keys', 'rm', '--yes');
    const exitCodePromise = aiGateway(client);
    await expect(client.stderr).toOutput('expects an API key id');
    expect(await exitCodePromise).toBe(1);
  });

  it('fails in non-interactive mode without --yes', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.stdin.isTTY = false;
    client.setArgv('ai-gateway', 'api-keys', 'rm', 'key_1');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('re-run with --yes');
    expect(await exitCodePromise).toBe(1);
  });

  it('reports a 404 as not found', async () => {
    const team = useTeam();
    useUser();
    useDeleteNotFound();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'rm', 'missing', '--yes');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('API key "missing" not found');
    expect(await exitCodePromise).toBe(1);
  });

  it('removes after interactive confirmation', async () => {
    const team = useTeam();
    useUser();
    useDeleteApiKey();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'rm', 'key_1');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Remove API key');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput('removed');
    expect(await exitCodePromise).toBe(0);
  });

  it('cancels when confirmation is declined', async () => {
    const team = useTeam();
    useUser();
    useDeleteApiKey();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'rm', 'key_1');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Remove API key');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('Canceled');
    expect(await exitCodePromise).toBe(0);
  });
});
