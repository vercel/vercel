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

describe('firewall rules reorder', () => {
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

  it('should move a rule to --first', async () => {
    const rules = [createRule(1), createRule(2), createRule(3)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv(
      'firewall',
      'rules',
      'reorder',
      'Test Rule 3',
      '--first',
      '--yes'
    );
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Moved');
    expect(await exitCodePromise).toEqual(0);

    expect(lastPatchBody.action).toBe('rules.priority');
    expect(lastPatchBody.id).toBe('rule_003');
    expect(lastPatchBody.value).toBe(0);
  });

  it('should move a rule to --last', async () => {
    const rules = [createRule(1), createRule(2), createRule(3)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv(
      'firewall',
      'rules',
      'reorder',
      'Test Rule 1',
      '--last',
      '--yes'
    );
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Moved');
    expect(await exitCodePromise).toEqual(0);

    expect(lastPatchBody.action).toBe('rules.priority');
    expect(lastPatchBody.id).toBe('rule_001');
    expect(lastPatchBody.value).toBe(2);
  });

  it('should move a rule to --position N', async () => {
    const rules = [createRule(1), createRule(2), createRule(3)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv(
      'firewall',
      'rules',
      'reorder',
      'Test Rule 1',
      '--position',
      '2',
      '--yes'
    );
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Moved');
    expect(await exitCodePromise).toEqual(0);

    expect(lastPatchBody.action).toBe('rules.priority');
    expect(lastPatchBody.id).toBe('rule_001');
    expect(lastPatchBody.value).toBe(1); // 1-based 2 → 0-based 1
  });

  it('should detect already at target position', async () => {
    const rules = [createRule(1), createRule(2), createRule(3)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);

    client.setArgv(
      'firewall',
      'rules',
      'reorder',
      'Test Rule 1',
      '--first',
      '--yes'
    );
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('already at position 1');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should error with fewer than 2 rules', async () => {
    const active = createConfig({ rules: [createRule(1)] });
    useListFirewallConfigs(active, null);

    client.setArgv(
      'firewall',
      'rules',
      'reorder',
      'Test Rule 1',
      '--first',
      '--yes'
    );
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('at least 2 rules');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error with invalid position 0', async () => {
    const rules = [createRule(1), createRule(2)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);

    client.setArgv(
      'firewall',
      'rules',
      'reorder',
      'Test Rule 1',
      '--position',
      '0',
      '--yes'
    );
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('at least 1');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error with position exceeding rule count', async () => {
    const rules = [createRule(1), createRule(2)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);

    client.setArgv(
      'firewall',
      'rules',
      'reorder',
      'Test Rule 1',
      '--position',
      '5',
      '--yes'
    );
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('exceeds');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error with mutually exclusive flags', async () => {
    const rules = [createRule(1), createRule(2)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);

    client.setArgv(
      'firewall',
      'rules',
      'reorder',
      'Test Rule 1',
      '--first',
      '--last',
      '--yes'
    );
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Cannot use');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error when rule not found', async () => {
    const rules = [createRule(1), createRule(2)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);

    client.setArgv(
      'firewall',
      'rules',
      'reorder',
      'nonexistent',
      '--first',
      '--yes'
    );
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No rule found');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error when no identifier provided in non-TTY', async () => {
    const rules = [createRule(1), createRule(2)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'reorder');
    (client.stdin as any).isTTY = false;
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Rule name or ID is required');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error when no position flag provided in non-TTY', async () => {
    const rules = [createRule(1), createRule(2)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'reorder', 'Test Rule 1', '--yes');
    (client.stdin as any).isTTY = false;
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('position flag is required');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should show interactive position prompt when no flags', async () => {
    const rules = [createRule(1), createRule(2), createRule(3)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv('firewall', 'rules', 'reorder', 'Test Rule 3', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('position (1-3)');
    client.stdin.write('1\n');
    await expect(client.stderr).toOutput('Moved');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should cancel when user declines', async () => {
    const rules = [createRule(1), createRule(2), createRule(3)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'reorder', 'Test Rule 3', '--first');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Move');
    client.stdin.write('n\n');
    await expect(client.stderr).toOutput('Canceled');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should work with move alias', async () => {
    const rules = [createRule(1), createRule(2), createRule(3)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();

    client.setArgv(
      'firewall',
      'rules',
      'move',
      'Test Rule 3',
      '--first',
      '--yes'
    );
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Moved');
    expect(await exitCodePromise).toEqual(0);
    expect(lastPatchBody.action).toBe('rules.priority');
    expect(lastPatchBody.id).toBe('rule_003');
    expect(lastPatchBody.value).toBe(0);
  });
});
