import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  useActivateConfig,
  usePatchDraft,
  createConfig,
  createRule,
  lastPatchBody,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall rules remove', () => {
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

  it('should remove a rule with --yes', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv('firewall', 'rules', 'remove', 'Test Rule 1', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Removed');
    expect(await exitCodePromise).toEqual(0);

    expect(lastPatchBody.action).toBe('rules.remove');
    expect(lastPatchBody.id).toBe('rule_001');
  });

  it('should work with rm alias', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv('firewall', 'rules', 'rm', 'Test Rule 1', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Removed');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should work with delete alias', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv('firewall', 'rules', 'delete', 'Test Rule 1', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Removed');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should show summary before confirming', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv('firewall', 'rules', 'remove', 'Test Rule 1', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Test Rule 1');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should cancel when user declines', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'remove', 'Test Rule 1');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Remove rule');
    client.stdin.write('n\n');
    await expect(client.stderr).toOutput('Canceled');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should error when rule not found', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'remove', 'nonexistent', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No rule found');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error when no identifier provided', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'remove');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Rule name or ID is required');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error when no rules exist', async () => {
    const active = createConfig({ rules: [] });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'remove', 'Test Rule 1', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No custom rules configured');
    expect(await exitCodePromise).toEqual(1);
  });
});
