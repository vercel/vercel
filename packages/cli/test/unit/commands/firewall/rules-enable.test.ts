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

describe('firewall rules enable', () => {
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

  it('should enable a disabled rule', async () => {
    const rule = createRule(3); // index 3 is inactive
    const active = createConfig({ rules: [rule] });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv('firewall', 'rules', 'enable', 'Test Rule 3', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Enabled');
    expect(await exitCodePromise).toEqual(0);

    expect(lastPatchBody.action).toBe('rules.update');
    expect(lastPatchBody.value.active).toBe(true);
  });

  it('should report already enabled', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'enable', 'Test Rule 1', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('already enabled');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should error when rule not found', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'enable', 'nonexistent', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No rule found');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error when no identifier provided in non-TTY', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'enable');
    (client.stdin as any).isTTY = false;
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Rule name or ID is required');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should show interactive picker when no identifier', async () => {
    const rule = createRule(3); // inactive
    const active = createConfig({ rules: [createRule(1), rule] });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv('firewall', 'rules', 'enable', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Select a rule to enable');
    client.stdin.write('\n'); // only disabled rules shown, select first (rule 3)
    await expect(client.stderr).toOutput('Enabled');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should error when no rules exist', async () => {
    const active = createConfig({ rules: [] });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'enable', 'Test Rule 1', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No custom rules configured');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should resolve by partial name', async () => {
    const rule = createRule(3); // inactive
    const active = createConfig({ rules: [createRule(1), rule] });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv('firewall', 'rules', 'enable', 'Rule 3', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Enabled');
    expect(await exitCodePromise).toEqual(0);

    expect(lastPatchBody.id).toBe(rule.id);
  });

  it('should resolve by rule ID', async () => {
    const rule = createRule(3);
    const active = createConfig({ rules: [rule] });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv('firewall', 'rules', 'enable', rule.id, '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Enabled');
    expect(await exitCodePromise).toEqual(0);
  });
});
