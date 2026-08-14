import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

function useDeleteRule() {
  let query: unknown;
  client.scenario.delete('/ai-gateway/rules', (req, res) => {
    query = req.query;
    res.status(204).end();
  });
  return () => query;
}

function useDeleteNotFound() {
  client.scenario.delete('/ai-gateway/rules', (_req, res) => {
    res
      .status(404)
      .json({ error: { code: 'not_found', message: 'Rule not found.' } });
  });
}

describe('ai-gateway rules remove', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'rules', 'remove', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:rules', value: 'rules' },
        { key: 'flag:help', value: 'ai-gateway rules:remove' },
      ]);
    });
  });

  it('removes a rule with --yes', async () => {
    const team = useTeam();
    useUser();
    const getQuery = useDeleteRule();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'rm', 'rule_1', '--yes');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('removed');
    expect(await exitCodePromise).toBe(0);
    expect(getQuery()).toMatchObject({ ruleId: 'rule_1' });
  });

  it('removes a rule via the delete alias', async () => {
    const team = useTeam();
    useUser();
    const getQuery = useDeleteRule();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'delete', 'rule_1', '--yes');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('removed');
    expect(await exitCodePromise).toBe(0);
    expect(getQuery()).toMatchObject({ ruleId: 'rule_1' });
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useDeleteRule();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'rules',
      'rm',
      'rule_1',
      '--yes',
      '--format',
      'json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"removed": true');
    expect(await exitCodePromise).toBe(0);
  });

  it('requires a rule id', async () => {
    useUser();
    client.setArgv('ai-gateway', 'rules', 'rm', '--yes');
    const exitCodePromise = aiGateway(client);
    await expect(client.stderr).toOutput('expects a rule id');
    expect(await exitCodePromise).toBe(1);
  });

  it('fails in non-interactive mode without --yes', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.stdin.isTTY = false;
    client.setArgv('ai-gateway', 'rules', 'rm', 'rule_1');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('re-run with --yes');
    expect(await exitCodePromise).toBe(1);
  });

  it('reports a 404 as not found', async () => {
    const team = useTeam();
    useUser();
    useDeleteNotFound();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'rm', 'missing', '--yes');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Routing rule "missing" not found');
    expect(await exitCodePromise).toBe(1);
  });

  it('removes after interactive confirmation', async () => {
    const team = useTeam();
    useUser();
    useDeleteRule();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'rm', 'rule_1');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Remove routing rule');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput('removed');
    expect(await exitCodePromise).toBe(0);
  });

  it('cancels when confirmation is declined', async () => {
    const team = useTeam();
    useUser();
    useDeleteRule();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'rm', 'rule_1');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Remove routing rule');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('Canceled');
    expect(await exitCodePromise).toBe(0);
  });
});
