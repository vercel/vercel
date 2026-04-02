import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  useActivateConfig,
  usePatchDraft,
  useGenerateFirewallRule,
  createConfig,
  createRule,
  createChange,
  lastPatchBody,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall rules edit', () => {
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

  // ─── Resolve + dispatch ────────────────────────────────────────────

  describe('resolve', () => {
    it('should edit a rule by name', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--action',
        'challenge',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should edit a rule by ID', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'rule_001',
        '--action',
        'log',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should error when rule not found', async () => {
      useListFirewallConfigs(createConfig({ rules: [] }), null);
      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'nonexistent',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('No rule found');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error when identifier is missing', async () => {
      client.setArgv('firewall', 'rules', 'edit', '--action', 'deny', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Missing required argument');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on multiple matches in non-TTY', async () => {
      const active = createConfig({
        rules: [createRule(1), createRule(2), createRule(3)],
      });
      useListFirewallConfigs(active, null);
      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule',
        '--action',
        'deny',
        '--yes'
      );
      (client.stdin as any).isTTY = false;

      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Multiple rules match');
      expect(await exitCodePromise).toEqual(1);
    });
  });

  // ─── Flag overrides ────────────────────────────────────────────────

  describe('flag overrides', () => {
    it('should change action only (preserve conditions)', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--action',
        'challenge',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      // Verify conditions preserved, action changed
      expect(lastPatchBody).toBeTruthy();
      expect(lastPatchBody.action).toBe('rules.update');
      expect(lastPatchBody.value.action.mitigate.action).toBe('challenge');
      expect(lastPatchBody.value.conditionGroup).toHaveLength(1);
    });

    it('should replace conditions', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--condition',
        'path:starts_with:/new',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.conditionGroup[0].conditions[0].type).toBe(
        'path'
      );
      expect(lastPatchBody.value.conditionGroup[0].conditions[0].op).toBe(
        'pre'
      );
    });

    it('should rename a rule', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--name',
        'New Rule Name',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('New Rule Name');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.name).toBe('New Rule Name');
    });

    it('should change description', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--description',
        'Updated description',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.description).toBe('Updated description');
    });

    it('should change duration only (preserve action)', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--duration',
        '30m',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.action.mitigate.actionDuration).toBe('30m');
    });

    it('should disable a rule', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--inactive',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.active).toBe(false);
    });

    it('should re-enable a rule', async () => {
      const rule = createRule(3); // index 3 is inactive
      const active = createConfig({ rules: [rule] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 3',
        '--active',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.active).toBe(true);
    });

    it('should detect no changes', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      // Pass --active on an already active rule — no change
      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--active',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('No changes detected');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should replace conditions with OR groups', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--condition',
        'path:starts_with:/a',
        '--or',
        '--condition',
        'path:starts_with:/b',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.conditionGroup).toHaveLength(2);
    });
  });

  // ─── JSON mode ─────────────────────────────────────────────────────

  describe('JSON mode', () => {
    it('should replace rule with JSON', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--json',
        JSON.stringify({
          name: 'JSON Updated',
          active: true,
          conditionGroup: [
            { conditions: [{ type: 'path', op: 'pre', value: '/new' }] },
          ],
          action: { mitigate: { action: 'challenge' } },
        }),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('JSON Updated');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should error on invalid JSON', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--json',
        '{bad',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Invalid JSON');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on missing fields in JSON', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--json',
        '{"conditionGroup":[],"action":{}}',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('"name" field');
      expect(await exitCodePromise).toEqual(1);
    });
  });

  // ─── AI mode ───────────────────────────────────────────────────────

  describe('AI mode', () => {
    it('should edit with AI and --yes', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();
      useGenerateFirewallRule();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--ai',
        'Change action to challenge',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should error when AI and --condition are both used', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--ai',
        'Change action',
        '--condition',
        'path:pre:/x',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        'Cannot use --ai, --json, and --condition'
      );
      expect(await exitCodePromise).toEqual(1);
    });
  });

  // ─── Interactive mode ──────────────────────────────────────────────

  // Interactive mode is tested manually (requires TTY)

  // ─── Non-interactive ───────────────────────────────────────────────

  describe('non-interactive', () => {
    // Note: "no flags in non-TTY" test omitted — uses process.exit(1) which crashes vitest

    it('should work with flags in non-TTY', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();
      (client.stdin as any).isTTY = false;

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--action',
        'log',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should verify rules.update patch action is sent', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--action',
        'deny',
        '--duration',
        '1h',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.action).toBe('rules.update');
      expect(lastPatchBody.id).toBe('rule_001');
      expect(lastPatchBody.value.name).toBe('Test Rule 1');
      expect(lastPatchBody.value.action.mitigate.action).toBe('deny');
      expect(lastPatchBody.value.action.mitigate.actionDuration).toBe('1h');
    });

    it('should handle invalid action in edit', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--action',
        'invalid',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Invalid action');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should handle invalid duration in edit', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--duration',
        '2h',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Invalid duration');
      expect(await exitCodePromise).toEqual(1);
    });
  });

  // ─── offerAutoPublish ──────────────────────────────────────────────

  describe('offerAutoPublish', () => {
    it('should warn about existing draft changes', async () => {
      const draft = createConfig({
        id: 'draft',
        rules: [createRule(1)],
        changes: [createChange('rules.insert', { value: { name: 'Other' } })],
      });
      useListFirewallConfigs(createConfig({ rules: [createRule(1)] }), draft);
      usePatchDraft();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--action',
        'challenge',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('other draft changes');
      expect(await exitCodePromise).toEqual(0);
    });
  });

  // ─── Help ──────────────────────────────────────────────────────────

  describe('help', () => {
    it('tracks help telemetry', async () => {
      client.setArgv('firewall', 'rules', 'edit', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
    });
  });
});
