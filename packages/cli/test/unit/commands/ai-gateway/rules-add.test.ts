import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

const sampleRule = {
  ownerId: 'team_abc',
  ruleId: 'rule_1',
  type: 'rewrite',
  match: { model: 'anthropic/claude-fable-5' },
  action: { rewriteModel: 'anthropic/claude-opus-4.8' },
  enabled: true,
  createdAt: 1,
  updatedAt: 2,
};

function useCreateRule(response: unknown = sampleRule) {
  let body: unknown;
  client.scenario.post('/ai-gateway/rules', (req, res) => {
    body = req.body;
    res.json(response);
  });
  return () => body;
}

describe('ai-gateway rules add', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'rules', 'add', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:rules', value: 'rules' },
        { key: 'flag:help', value: 'ai-gateway rules:add' },
      ]);
    });
  });

  it('adds a rewrite rule', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateRule();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'rules',
      'add',
      '--type',
      'rewrite',
      '--source',
      'anthropic/claude-fable-5',
      '--destination',
      'anthropic/claude-opus-4.8'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('rule_1');
    await expect(client.stderr).toOutput('added');
    expect(await exitCodePromise).toBe(0);
    expect(getBody()).toMatchObject({
      type: 'rewrite',
      match: { model: 'anthropic/claude-fable-5' },
      action: { rewriteModel: 'anthropic/claude-opus-4.8' },
    });
  });

  it('shows a beta notice when a rules subcommand runs', async () => {
    const team = useTeam();
    useUser();
    useCreateRule();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'rules',
      'add',
      '--type',
      'deny',
      '--source',
      'openai/gpt-4o'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('in beta');
    expect(await exitCodePromise).toBe(0);
  });

  it('adds a deny rule', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateRule({
      ...sampleRule,
      ruleId: 'rule_2',
      type: 'deny',
      match: { model: 'openai/gpt-4o' },
      action: undefined,
    });
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'rules',
      'add',
      '--type',
      'deny',
      '--source',
      'openai/gpt-4o'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('rule_2');
    expect(await exitCodePromise).toBe(0);
    expect(getBody()).toMatchObject({
      type: 'deny',
      match: { model: 'openai/gpt-4o' },
    });
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useCreateRule();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'rules',
      'add',
      '--type',
      'rewrite',
      '--source',
      'anthropic/claude-fable-5',
      '--destination',
      'anthropic/claude-opus-4.8',
      '--format',
      'json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"ruleId": "rule_1"');
    expect(await exitCodePromise).toBe(0);
  });

  it('adds a deny rule with a reason', async () => {
    const team = useTeam();
    useUser();
    const getBody = useCreateRule({
      ...sampleRule,
      ruleId: 'rule_3',
      type: 'deny',
      match: { model: 'openai/gpt-4o' },
      action: { reason: 'cost control' },
    });
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'rules',
      'add',
      '--type',
      'deny',
      '--source',
      'openai/gpt-4o',
      '--reason',
      'cost control'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('rule_3');
    expect(await exitCodePromise).toBe(0);
    expect(getBody()).toMatchObject({
      type: 'deny',
      match: { model: 'openai/gpt-4o' },
      action: { reason: 'cost control' },
    });
  });

  it('surfaces a backend error', async () => {
    const team = useTeam();
    useUser();
    client.scenario.post('/ai-gateway/rules', (_req, res) => {
      res.status(400).json({
        error: { code: 'bad_request', message: 'Rules are not enabled.' },
      });
    });
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'rules',
      'add',
      '--type',
      'deny',
      '--source',
      'openai/gpt-4o'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Rules are not enabled');
    expect(await exitCodePromise).toBe(1);
  });

  describe('validation', () => {
    it('requires --type', async () => {
      useUser();
      client.setArgv('ai-gateway', 'rules', 'add', '--source', 'm');
      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput('--type flag is required');
      expect(await exitCodePromise).toBe(1);
    });

    it('rejects an invalid --type', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'rules',
        'add',
        '--type',
        'bogus',
        '--source',
        'm'
      );
      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput('--type flag is required');
      expect(await exitCodePromise).toBe(1);
    });

    it('requires --source', async () => {
      useUser();
      client.setArgv('ai-gateway', 'rules', 'add', '--type', 'deny');
      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput('--source flag is required');
      expect(await exitCodePromise).toBe(1);
    });

    it('requires --destination for a rewrite rule', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'rules',
        'add',
        '--type',
        'rewrite',
        '--source',
        'm'
      );
      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        'rewrite rule requires --destination'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('rejects --destination on a deny rule', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'rules',
        'add',
        '--type',
        'deny',
        '--source',
        'm',
        '--destination',
        'n'
      );
      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        'deny rule cannot set --destination'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });
});
