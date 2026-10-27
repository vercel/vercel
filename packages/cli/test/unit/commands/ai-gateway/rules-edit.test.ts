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

function useUpdateRule(response: unknown = { ...sampleRule, enabled: false }) {
  let body: unknown;
  client.scenario.patch('/ai-gateway/rules', (req, res) => {
    body = req.body;
    res.json(response);
  });
  return () => body;
}

function useUpdateNotFound() {
  client.scenario.patch('/ai-gateway/rules', (_req, res) => {
    res
      .status(404)
      .json({ error: { code: 'not_found', message: 'Rule not found.' } });
  });
}

describe('ai-gateway rules edit', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'rules', 'edit', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:rules', value: 'rules' },
        { key: 'flag:help', value: 'ai-gateway rules:edit' },
      ]);
    });
  });

  it('turns a rule off with --no-enable', async () => {
    const team = useTeam();
    useUser();
    const getBody = useUpdateRule();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'update', 'rule_1', '--no-enable');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('updated');
    expect(await exitCodePromise).toBe(0);
    expect(getBody()).toMatchObject({ ruleId: 'rule_1', enabled: false });
    expect(client.stderr.getFullOutput()).not.toContain('deprecated');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:rules', value: 'rules' },
      { key: 'subcommand:update', value: 'update' },
      { key: 'argument:ruleId', value: '[REDACTED]' },
      { key: 'flag:no-enable', value: 'TRUE' },
    ]);
  });

  it('turns a rule on with --enable', async () => {
    const team = useTeam();
    useUser();
    const getBody = useUpdateRule({ ...sampleRule, enabled: true });
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'update', 'rule_1', '--enable');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('updated');
    expect(await exitCodePromise).toBe(0);
    expect(getBody()).toMatchObject({ ruleId: 'rule_1', enabled: true });
  });

  it('still turns a rule off with the old --disable, with a warning', async () => {
    const team = useTeam();
    useUser();
    const getBody = useUpdateRule();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'update', 'rule_1', '--disable');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput(
      '--disable is deprecated. Use --no-enable.'
    );
    expect(await exitCodePromise).toBe(0);
    expect(getBody()).toMatchObject({ ruleId: 'rule_1', enabled: false });
  });

  it('requires a rule id', async () => {
    useUser();
    client.setArgv('ai-gateway', 'rules', 'edit', '--no-enable');
    const exitCodePromise = aiGateway(client);
    await expect(client.stderr).toOutput('expects a rule id');
    expect(await exitCodePromise).toBe(2);
  });

  it.each([
    ['--no-enable'],
    ['--disable'],
  ])('rejects both --enable and %s', async offFlag => {
    useUser();
    client.setArgv(
      'ai-gateway',
      'rules',
      'update',
      'rule_1',
      '--enable',
      offFlag
    );
    const exitCodePromise = aiGateway(client);
    await expect(client.stderr).toOutput(`Can't use --enable with ${offFlag}.`);
    expect(await exitCodePromise).toBe(2);
  });

  it('requires at least one field to edit', async () => {
    useUser();
    client.setArgv('ai-gateway', 'rules', 'edit', 'rule_1');
    const exitCodePromise = aiGateway(client);
    await expect(client.stderr).toOutput('Nothing to edit');
    expect(await exitCodePromise).toBe(1);
  });

  it('reports a 404 as not found', async () => {
    const team = useTeam();
    useUser();
    useUpdateNotFound();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'edit', 'missing', '--no-enable');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Routing rule "missing" not found');
    expect(await exitCodePromise).toBe(1);
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useUpdateRule();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'rules',
      'edit',
      'rule_1',
      '--no-enable',
      '--format',
      'json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"ruleId": "rule_1"');
    expect(await exitCodePromise).toBe(0);
  });

  it('edits the rewrite target and description', async () => {
    const team = useTeam();
    useUser();
    const getBody = useUpdateRule();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'rules',
      'edit',
      'rule_1',
      '--destination',
      'anthropic/claude-opus-4.8',
      '--description',
      'route legacy model'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('updated');
    expect(await exitCodePromise).toBe(0);
    expect(getBody()).toMatchObject({
      ruleId: 'rule_1',
      description: 'route legacy model',
      action: { rewriteModel: 'anthropic/claude-opus-4.8' },
    });
  });

  describe('subcommand name', () => {
    function useRuleUpdate() {
      const team = useTeam();
      useUser();
      useUpdateRule();
      client.config.currentTeam = team.id;
    }

    it('warns when invoked as the deprecated edit name', async () => {
      useRuleUpdate();
      client.setArgv('ai-gateway', 'rules', 'edit', 'rule_1', '--no-enable');

      expect(await aiGateway(client)).toBe(0);
      await expect(client.stderr).toOutput(
        '`vercel ai-gateway rules edit` is deprecated. Use `vercel ai-gateway rules update`.'
      );
    });

    it('does not warn when invoked as update', async () => {
      useRuleUpdate();
      client.setArgv('ai-gateway', 'rules', 'update', 'rule_1', '--no-enable');

      expect(await aiGateway(client)).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('Routing rule rule_1 updated');
      expect(output).not.toContain('edited');
      expect(output).not.toContain('is deprecated');
    });
  });
});
