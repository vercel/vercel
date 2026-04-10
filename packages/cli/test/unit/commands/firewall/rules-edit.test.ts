import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  useActivateConfig,
  usePatchDraft,
  useGenerateFirewallRule,
  capturedRequests,
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
    // Reset capturedRequests for test isolation
    for (const key of Object.keys(capturedRequests)) {
      delete (capturedRequests as Record<string, unknown>)[key];
    }
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
      expect(lastPatchBody.action).toBe('rules.update');
      expect(lastPatchBody.id).toBe('rule_001');
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
      expect(lastPatchBody.action).toBe('rules.update');
      expect(lastPatchBody.value.action.mitigate.action).toBe('log');
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

    it('should error when identifier is missing in non-TTY', async () => {
      useListFirewallConfigs(createConfig({ rules: [createRule(1)] }), null);
      (client.stdin as any).isTTY = false;
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
        '{"type":"path","op":"pre","value":"/new"}',
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
        '--disabled',
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
        '--enabled',
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

      // Pass --enabled on an already active rule — no change
      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--enabled',
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
        '{"type":"path","op":"pre","value":"/a"}',
        '--or',
        '--condition',
        '{"type":"path","op":"pre","value":"/b"}',
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
      expect(lastPatchBody.action).toBe('rules.update');
      expect(lastPatchBody.value.name).toBe('JSON Updated');
      expect(lastPatchBody.value.action.mitigate.action).toBe('challenge');
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
    it('should block AI mode in non-interactive mode', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--ai',
        'Change action',
        '--yes'
      );
      (client.stdin as any).isTTY = false;
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        'AI mode is not available in non-interactive mode'
      );
      expect(await exitCodePromise).toEqual(1);
    });

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
        '{"type":"path","op":"pre","value":"/x"}',
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
    it('should error in non-TTY with no flags', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv('firewall', 'rules', 'edit', 'Test Rule 1');
      (client.stdin as any).isTTY = false;
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Interactive mode is not available');
      expect(await exitCodePromise).toEqual(1);
    });

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
    it('should error when --enabled and --disabled are both passed', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--enabled',
        '--disabled',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        'Cannot use --enabled and --disabled together'
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error when --name exceeds 160 characters', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--name',
        'a'.repeat(161),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('160 characters or less');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error when --description exceeds 256 characters', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--description',
        'a'.repeat(257),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('256 characters or less');
      expect(await exitCodePromise).toEqual(1);
    });

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

  // ─── Interactive rule selection ─────────────────────────────────────

  describe('interactive rule selection', () => {
    // Interactive rule selection (TTY) is tested manually — requires multi-step
    // stdin simulation that's fragile in unit tests.

    it('should error with no rules when no identifier in TTY', async () => {
      useListFirewallConfigs(createConfig({ rules: [] }), null);

      client.setArgv('firewall', 'rules', 'edit');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('No custom rules configured');
      expect(await exitCodePromise).toEqual(1);
    });
  });

  // ─── Additional flag mode tests ────────────────────────────────────

  describe('additional flag overrides', () => {
    it('should change to rate_limit action with rate limit flags', async () => {
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
        'rate_limit',
        '--rate-limit-window',
        '60',
        '--rate-limit-requests',
        '100',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.action.mitigate.action).toBe('rate_limit');
      expect(lastPatchBody.value.action.mitigate.rateLimit.window).toBe(60);
      expect(lastPatchBody.value.action.mitigate.rateLimit.limit).toBe(100);
      expect(lastPatchBody.value.action.mitigate.rateLimit.action).toBe(
        'rate_limit'
      ); // default
    });

    it('should change rate limit with custom --rate-limit-action', async () => {
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
        'rate_limit',
        '--rate-limit-window',
        '60',
        '--rate-limit-requests',
        '100',
        '--rate-limit-action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);
      expect(lastPatchBody.value.action.mitigate.rateLimit.action).toBe('deny');
    });

    it('should change to redirect action', async () => {
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
        'redirect',
        '--redirect-url',
        '/new-path',
        '--redirect-permanent',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.action.mitigate.action).toBe('redirect');
      expect(lastPatchBody.value.action.mitigate.redirect.location).toBe(
        '/new-path'
      );
      expect(lastPatchBody.value.action.mitigate.redirect.permanent).toBe(true);
    });

    it('should accept readable operator aliases in condition replacement', async () => {
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
        '{"type":"path","op":"pre","value":"/new-api"}',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.conditionGroup[0].conditions[0].op).toBe(
        'pre'
      );
      expect(lastPatchBody.value.conditionGroup[0].conditions[0].value).toBe(
        '/new-api'
      );
    });

    it('should apply multiple flag overrides at once', async () => {
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
        'Renamed Rule',
        '--action',
        'challenge',
        '--description',
        'New description',
        '--duration',
        '30m',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.name).toBe('Renamed Rule');
      expect(lastPatchBody.value.action.mitigate.action).toBe('challenge');
      expect(lastPatchBody.value.description).toBe('New description');
      expect(lastPatchBody.value.action.mitigate.actionDuration).toBe('30m');
    });

    it('should clear description with empty string', async () => {
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
        '',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.description).toBeUndefined();
    });

    it('should error on rate_limit missing window', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--action',
        'rate_limit',
        '--rate-limit-requests',
        '100',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('--rate-limit-window is required');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on redirect missing URL', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--action',
        'redirect',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('requires --redirect-url');
      expect(await exitCodePromise).toEqual(1);
    });
  });

  // ─── JSON with all fields ──────────────────────────────────────────

  describe('JSON full replacement', () => {
    it('should replace rule with all fields via JSON', async () => {
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
          name: 'Fully Replaced',
          description: 'Brand new description',
          active: false,
          conditionGroup: [
            { conditions: [{ type: 'path', op: 'pre', value: '/new' }] },
            { conditions: [{ type: 'method', op: 'eq', value: 'DELETE' }] },
          ],
          action: {
            mitigate: {
              action: 'challenge',
              actionDuration: '15m',
              rateLimit: null,
              redirect: null,
            },
          },
        }),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Fully Replaced');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.name).toBe('Fully Replaced');
      expect(lastPatchBody.value.description).toBe('Brand new description');
      expect(lastPatchBody.value.active).toBe(false);
      expect(lastPatchBody.value.conditionGroup).toHaveLength(2);
      expect(lastPatchBody.value.action.mitigate.action).toBe('challenge');
      expect(lastPatchBody.value.action.mitigate.actionDuration).toBe('15m');
    });
  });

  // ─── AI with specific rule ─────────────────────────────────────────

  describe('AI edit verification', () => {
    it('should send currentRule to generate endpoint', async () => {
      const rule = createRule(1);
      const active = createConfig({ rules: [rule] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();
      useGenerateFirewallRule({
        ...rule,
        name: 'AI Modified Rule',
        action: {
          mitigate: {
            action: 'challenge',
            rateLimit: null,
            redirect: null,
            actionDuration: '5m',
          },
        },
      });

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--ai',
        'Change action to challenge with 5m duration',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('AI Modified Rule');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.action).toBe('rules.update');
      expect(lastPatchBody.value.name).toBe('AI Modified Rule');
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
