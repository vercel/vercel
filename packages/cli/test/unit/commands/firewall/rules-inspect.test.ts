import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  createConfig,
  createRule,
  createRateLimitRule,
  createMultiGroupRule,
  createRedirectRule,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall rules inspect', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'firewall-test-project',
      name: 'firewall-test',
    });
    const cwd = setupUnitFixture('commands/firewall');
    client.cwd = cwd;
  });

  it('should inspect a rule by name', async () => {
    const active = createConfig({
      rules: [createRule(1), createRule(2)],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'inspect', 'Test Rule 1');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Test Rule 1');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should inspect a rule by ID', async () => {
    const active = createConfig({
      rules: [createRule(1)],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'inspect', 'rule_001');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Test Rule 1');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should inspect a rate limit rule with full details', async () => {
    const active = createConfig({
      rules: [createRateLimitRule()],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'inspect', 'Rate Limit API');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Rate Limit API');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Rate Limit');
    expect(fullOutput).toContain('Algorithm:');
    expect(fullOutput).toContain('Window:');
    expect(fullOutput).toContain('Limit:');
    expect(fullOutput).toContain('Keys:');
  });

  it('should inspect a multi-group rule', async () => {
    const active = createConfig({
      rules: [createMultiGroupRule()],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'inspect', 'Block Suspicious');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Block Suspicious Traffic');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Conditions:');
    expect(fullOutput).toContain('OR');
    expect(fullOutput).toContain('Deny');
  });

  it('should inspect a redirect rule', async () => {
    const active = createConfig({
      rules: [createRedirectRule()],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'inspect', 'Redirect Old');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Redirect Old Path');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Redirect');
    expect(fullOutput).toContain('/new');
  });

  it('should error when rule not found', async () => {
    useListFirewallConfigs(createConfig({ rules: [] }), null);
    client.setArgv('firewall', 'rules', 'inspect', 'nonexistent');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No rule found');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error when identifier is missing', async () => {
    client.setArgv('firewall', 'rules', 'inspect');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Rule name or ID is required');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error on multiple matches in non-TTY mode', async () => {
    const active = createConfig({
      rules: [createRule(1), createRule(2), createRule(3)],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'inspect', 'Test Rule');
    (client.stdin as any).isTTY = false;

    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Multiple rules match');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should output valid JSON with --json flag', async () => {
    const active = createConfig({
      rules: [createRule(1)],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'inspect', 'Test Rule 1', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);

    // Verify JSON shape
    const jsonOutput = (client.stdout as any).getFullOutput();
    const parsed = JSON.parse(jsonOutput);
    expect(parsed).toHaveProperty('name', 'Test Rule 1');
    expect(parsed).toHaveProperty('id', 'rule_001');
    expect(parsed).toHaveProperty('active');
    expect(parsed).toHaveProperty('conditionGroup');
    expect(parsed).toHaveProperty('action');
  });

  it('tracks help telemetry', async () => {
    client.setArgv('firewall', 'rules', 'inspect', '--help');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(2);
  });
});
