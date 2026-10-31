import { describe, expect, it, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { help } from '../../../../src/commands/help';
import {
  firewallCommand,
  rulesReorderSubcommand,
  rulesSubcommand,
} from '../../../../src/commands/firewall/command';
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
    expect(await exitCodePromise).toEqual(2);
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
    expect(await exitCodePromise).toEqual(2);
  });

  it('should error when no position flag provided in non-TTY', async () => {
    const rules = [createRule(1), createRule(2)];
    const active = createConfig({ rules });
    useListFirewallConfigs(active, null);

    client.setArgv('firewall', 'rules', 'reorder', 'Test Rule 1', '--yes');
    (client.stdin as any).isTTY = false;
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('position option is required');
    expect(await exitCodePromise).toEqual(2);
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

  describe('subcommand name', () => {
    function useThreeRules() {
      const rules = [createRule(1), createRule(2), createRule(3)];
      useListFirewallConfigs(createConfig({ rules }), null);
      usePatchDraft();
      useActivateConfig();
    }

    it('warns when invoked as the deprecated reorder name', async () => {
      useThreeRules();
      client.setArgv(
        'firewall',
        'rules',
        'reorder',
        'Test Rule 3',
        '--first',
        '--yes'
      );

      expect(await firewall(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        '`vercel firewall rules reorder` is deprecated. Use `vercel firewall rules move`.'
      );
    });

    it('does not warn when invoked as move', async () => {
      useThreeRules();
      client.setArgv(
        'firewall',
        'rules',
        'move',
        'Test Rule 3',
        '--first',
        '--yes'
      );

      expect(await firewall(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:rules', value: 'rules' },
        { key: 'subcommand:rules:move', value: 'move' },
      ]);
    });

    it('asks which rule to move', async () => {
      useThreeRules();
      client.setArgv('firewall', 'rules', 'move', '--first', '--yes');

      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Select a rule to move:');
      client.stdin.write('\n');
      expect(await exitCodePromise).toEqual(0);
    });

    it('teaches move in suggestions', async () => {
      useThreeRules();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);
      client.nonInteractive = true;
      client.setArgv('firewall', 'rules', 'reorder', '--non-interactive');
      await firewall(client);
      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.next[0].command).toContain(
        'firewall rules move <name-or-id> --first --yes'
      );
      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('shows only move in help', () => {
      const rulesHelp = help(rulesSubcommand, {
        stream: { isTTY: false },
        parent: firewallCommand,
        columns: 120,
      });
      expect(rulesHelp).toMatch(/^ {2}move\s/m);
      expect(rulesHelp).not.toContain('reorder');

      const moveHelp = help(rulesReorderSubcommand, {
        stream: { isTTY: false },
        parent: { ...firewallCommand, name: 'firewall rules' },
        columns: 120,
      });
      expect(moveHelp).toContain('firewall rules move "My Rule" --first --yes');
      expect(moveHelp).not.toContain('reorder');
    });
  });
});
