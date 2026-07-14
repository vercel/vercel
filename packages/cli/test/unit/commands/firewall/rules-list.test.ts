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
  createEmptyConditionRule,
  createChange,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall rules list', () => {
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

  it('should show no rules when empty', async () => {
    useListFirewallConfigs(createConfig(), null);
    client.setArgv('firewall', 'rules', 'list');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No custom rules configured');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should list active rules in table format', async () => {
    const active = createConfig({
      rules: [createRule(1), createRule(2), createRule(3)],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'list');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Showing live configuration');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Test Rule 1');
    expect(fullOutput).toContain('Test Rule 2');
    expect(fullOutput).toContain('Test Rule 3');
    expect(fullOutput).toContain('Challenge');
    expect(fullOutput).toContain('Deny');
  });

  it('should list rules with various action types', async () => {
    const active = createConfig({
      rules: [
        createRule(1),
        createRateLimitRule(),
        createMultiGroupRule(),
        createRedirectRule(),
      ],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'list');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Showing live configuration');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should annotate draft additions', async () => {
    const active = createConfig({
      rules: [createRule(1)],
    });
    const draft = createConfig({
      id: 'draft',
      rules: [createRule(1), createRule(2)],
      changes: [
        createChange('rules.insert', {
          id: 'rule_002',
          value: { name: 'Test Rule 2' },
        }),
      ],
    });
    useListFirewallConfigs(active, draft);
    client.setArgv('firewall', 'rules', 'list');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('unpublished rule change');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should show expanded view with --expand', async () => {
    const active = createConfig({
      rules: [createMultiGroupRule(), createRateLimitRule()],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'list', '--expand');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Showing live configuration');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Conditions:');
    expect(fullOutput).toContain('Action:');
  });

  it('should show expand with draft annotations', async () => {
    const active = createConfig({
      rules: [createRule(1)],
    });
    const draft = createConfig({
      id: 'draft',
      rules: [createRule(1), createRule(2)],
      changes: [
        createChange('rules.insert', {
          id: 'rule_002',
          value: { name: 'Test Rule 2' },
        }),
      ],
    });
    useListFirewallConfigs(active, draft);
    client.setArgv('firewall', 'rules', 'list', '--expand');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('unpublished rule change');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Test Rule 2');
  });

  it('should output valid JSON with --json flag', async () => {
    const active = createConfig({
      rules: [createRule(1), createRateLimitRule()],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'list', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);

    // Verify JSON shape from stdout
    const jsonOutput = (client.stdout as any).getFullOutput();
    const parsed = JSON.parse(jsonOutput);
    expect(parsed).toHaveProperty('rules');
    expect(parsed).toHaveProperty('hasDraft');
    expect(parsed).toHaveProperty('pendingChanges');
    expect(parsed.rules).toHaveLength(2);
    expect(parsed.rules[0]).toHaveProperty('_status', 'live');
    expect(parsed.rules[0]).toHaveProperty('name');
    expect(parsed.rules[0]).toHaveProperty('action');
  });

  it('should handle rules with empty conditionGroup', async () => {
    const active = createConfig({
      rules: [createEmptyConditionRule()],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'list', '--expand');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No conditions');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should show _status added and removed in JSON with draft', async () => {
    const active = createConfig({
      rules: [createRule(1), createRule(2)],
    });
    const draft = createConfig({
      id: 'draft',
      rules: [createRule(1), createRule(3)],
      changes: [
        createChange('rules.insert', {
          id: 'rule_003',
          value: { name: 'Test Rule 3' },
        }),
        createChange('rules.remove', {
          id: 'rule_002',
        }),
      ],
    });
    useListFirewallConfigs(active, draft);
    client.setArgv('firewall', 'rules', 'list', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);

    const jsonOutput = (client.stdout as any).getFullOutput();
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.hasDraft).toBe(true);
    expect(parsed.pendingChanges).toBe(2);

    const statuses = parsed.rules.map((r: { _status: string }) => r._status);
    expect(statuses).toContain('live');
    expect(statuses).toContain('added');
    expect(statuses).toContain('removed');
  });

  it('should show redirect rule in expanded view', async () => {
    const active = createConfig({
      rules: [createRedirectRule()],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'list', '--expand');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Redirect');
    expect(await exitCodePromise).toEqual(0);
  });

  it('tracks help telemetry', async () => {
    client.setArgv('firewall', 'rules', 'list', '--help');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(2);
  });
});
