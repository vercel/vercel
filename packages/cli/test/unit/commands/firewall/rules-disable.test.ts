import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  useActivateConfig,
  usePatchDraft,
  capturedRequests,
  createConfig,
  createRule,
  lastPatchBody,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall rules disable', () => {
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
    for (const key of Object.keys(capturedRequests)) {
      delete (capturedRequests as Record<string, unknown>)[key];
    }
  });

  it('should disable an enabled rule', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv('firewall', 'rules', 'disable', 'Test Rule 1', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Disabled');
    expect(await exitCodePromise).toEqual(0);

    expect(lastPatchBody.action).toBe('rules.update');
    expect(lastPatchBody.value.active).toBe(false);
  });

  it('should report already disabled', async () => {
    const rule = createRule(3); // index 3 is inactive
    const active = createConfig({ rules: [rule] });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'disable', 'Test Rule 3', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('already disabled');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should error when rule not found', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'disable', 'nonexistent', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No rule found');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error when no identifier provided in non-TTY', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'disable');
    (client.stdin as any).isTTY = false;
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Rule name or ID is required');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should show interactive picker when no identifier', async () => {
    const active = createConfig({ rules: [createRule(1), createRule(2)] });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv('firewall', 'rules', 'disable', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Select a rule to disable');
    client.stdin.write('\n'); // select first rule
    await expect(client.stderr).toOutput('Disabled');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should error when no rules exist', async () => {
    const active = createConfig({ rules: [] });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'disable', 'Test Rule 1', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No custom rules configured');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should resolve by partial name', async () => {
    const active = createConfig({
      rules: [createRule(1), createRule(2)],
    });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv('firewall', 'rules', 'disable', 'Rule 1', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Disabled');
    expect(await exitCodePromise).toEqual(0);

    expect(lastPatchBody.id).toBe('rule_001');
  });
});
