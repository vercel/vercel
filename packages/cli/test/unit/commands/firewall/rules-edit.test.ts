import { describe, expect, it, beforeEach, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
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
import { setTeamBillingPlan, useTeams } from '../../../mocks/team';
import { teamCache } from '../../../../src/util/teams/get-team-by-id-or-slug';
import { quoteArg } from '../../../../src/util/flags/quote-arg';
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
      expect(await exitCodePromise).toEqual(2);
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

    it.each([
      ['--no-enable', false],
      ['--disabled', true],
    ])('should turn a rule off with %s', async (flag, deprecated) => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'update',
        'Test Rule 1',
        flag,
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.active).toBe(false);
      const stderr = client.stderr.getFullOutput();
      if (deprecated) {
        expect(stderr).toContain(`${flag} is deprecated. Use --no-enable.`);
      } else {
        expect(stderr).not.toContain('deprecated');
      }
    });

    it.each([
      ['--enable', false],
      ['--enabled', true],
    ])('should turn a rule back on with %s', async (flag, deprecated) => {
      const rule = createRule(3); // index 3 is inactive
      const active = createConfig({ rules: [rule] });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'update',
        'Test Rule 3',
        flag,
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);

      expect(lastPatchBody.value.active).toBe(true);
      const stderr = client.stderr.getFullOutput();
      if (deprecated) {
        expect(stderr).toContain(`${flag} is deprecated. Use --enable.`);
      } else {
        expect(stderr).not.toContain('deprecated');
      }
    });

    it('should detect no changes', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      // Pass --enable on an already active rule — no change
      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--enable',
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
        '--data',
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
        '--data',
        '{bad',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Invalid JSON');
      expect(await exitCodePromise).toEqual(2);
    });

    it('should error on missing fields in JSON', async () => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'Test Rule 1',
        '--data',
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
        'Cannot use --ai, --data, and --condition'
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
      expect(await exitCodePromise).toEqual(2);
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
    it.each([
      ['--enable', '--no-enable'],
      ['--enabled', '--disabled'],
      ['--enable', '--disabled'],
    ])('should error when %s and %s are both passed', async (onFlag, offFlag) => {
      const active = createConfig({ rules: [createRule(1)] });
      useListFirewallConfigs(active, null);

      client.setArgv(
        'firewall',
        'rules',
        'update',
        'Test Rule 1',
        onFlag,
        offFlag,
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        `Can't use ${onFlag} with ${offFlag}.`
      );
      expect(await exitCodePromise).toEqual(2);
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

    it('prompts for a managed bot action when none was given', async () => {
      useListFirewallConfigs(createConfig({ rules: [] }), null);

      client.setArgv('firewall', 'rules', 'edit');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Select a rule to update');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Action?');
      client.stdin.write('\n');
      expect(await exitCodePromise).toEqual(0);
      expect(client.stderr.getFullOutput()).toContain('No changes detected');
    });

    it('does not reprint Rule/ID after Action? before confirming', async () => {
      useListFirewallConfigs(createConfig({ rules: [] }), null);

      client.setArgv('firewall', 'rules', 'edit');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Select a rule to update');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Action?');
      client.stdin.write('\x1B[B');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Save Bot Protection → Log?');
      expect(
        stripAnsi(client.stderr.getFullOutput()).match(/WAF ID/g)?.length
      ).toBe(1);
      client.stdin.write('n\n');
      expect(await exitCodePromise).toEqual(0);
    });

    it('edits a picked custom rule whose name matches a managed alias', async () => {
      const rule = { ...createRule(1), name: 'AI Bots' };
      useListFirewallConfigs(createConfig({ rules: [rule] }), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv('firewall', 'rules', 'edit', '--action', 'log', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Select a rule to update');
      client.stdin.write('\x1B[B');
      client.stdin.write('\x1B[B');
      client.stdin.write('\x1B[B');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('updated and staged');
      expect(await exitCodePromise).toEqual(0);
      expect(lastPatchBody.action).toBe('rules.update');
      expect(lastPatchBody.id).toBe('rule_001');
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
        '--data',
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

  describe('managed bot rules', () => {
    it('stages a managedRules.update patch for Bot Protection', async () => {
      const active = createConfig({
        managedRules: {
          bot_filter: { active: true, action: 'challenge' },
        },
      });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'managed_bot_protection',
        '--action',
        'log',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('updated to Log');
      expect(await exitCodePromise).toEqual(0);
      expect(lastPatchBody.action).toBe('managedRules.update');
      expect(lastPatchBody.id).toBe('bot_protection');
      expect(lastPatchBody.value).toEqual({ active: true, action: 'log' });
    });

    it('stages botId.toggle for BotID Deep Analysis', async () => {
      const active = createConfig({ botIdEnabled: false });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'bot-id',
        '--action',
        'deep-analysis',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('npm i botid');
      expect(await exitCodePromise).toEqual(0);
      expect(lastPatchBody.action).toBe('botId.toggle');
      expect(lastPatchBody.value).toBe(true);
    });

    it('requires --action on a managed bot rule in non-TTY', async () => {
      useListFirewallConfigs(createConfig(), null);
      (client.stdin as any).isTTY = false;

      client.setArgv('firewall', 'rules', 'edit', 'bot-protection');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
      expect(client.stderr.getFullOutput()).toContain('Specify --action');
    });

    it('shows a traffic warning before the save prompt', async () => {
      useListFirewallConfigs(createConfig(), null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'ai-bots',
        '--action',
        'deny'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('AI Bots deny blocks');
      await expect(client.stderr).toOutput('Save AI Bots → Deny?');
      expect(client.stderr.getFullOutput()).not.toContain(
        'this project. Save AI Bots'
      );
      client.stdin.write('n\n');
      expect(await exitCodePromise).toEqual(0);
    });

    it('rejects custom-rule flags on managed bot rules', async () => {
      useListFirewallConfigs(createConfig(), null);
      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'ai-bots',
        '--condition',
        '{"type":"path","op":"pre","value":"/api"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
      expect(client.stderr.getFullOutput()).toContain("Can't use --condition");
    });

    it('rejects BotID Deep Analysis on the Hobby plan', async () => {
      setTeamBillingPlan('hobby');
      useListFirewallConfigs(createConfig({ botIdEnabled: false }), null);

      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'bot-id',
        '--action',
        'deep-analysis',
        '--yes'
      );
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'not available on the Hobby plan'
      );
    });

    // A plan limit is not a usage error, so agents get the same exit code 1.
    it('exits 1 for the Hobby plan in non-interactive mode', async () => {
      setTeamBillingPlan('hobby');
      useListFirewallConfigs(createConfig({ botIdEnabled: false }), null);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
        code?: number
      ) => {
        throw new Error(`exit:${code}`);
      }) as () => never);
      client.nonInteractive = true;
      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'bot-id',
        '--action',
        'deep-analysis',
        '--yes'
      );

      try {
        await expect(firewall(client)).rejects.toThrow('exit:1');
        expect(client.stdout.getFullOutput()).toContain(
          '"reason": "plan_upgrade_required"'
        );
      } finally {
        exitSpy.mockRestore();
        client.nonInteractive = false;
      }
    });
  });

  it('turns a Priority project 401 on rules edit into an upsell', async () => {
    useListFirewallConfigs(createConfig({ rules: [createRule(1)] }), null);
    client.scenario.patch(
      '/v1/security/firewall/config/draft',
      (_req: any, res: any) => {
        res.status(401).json({
          error: {
            code: 'unauthorized',
            message: 'This feature requires a Priority project',
          },
        });
      }
    );

    client.setArgv(
      'firewall',
      'rules',
      'edit',
      'rule_001',
      '--action',
      'deny',
      '--yes'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    const output = client.stderr.getFullOutput();
    const team = teamCache.get('team_dummy');
    expect(output).toContain(
      `This rule requires a Priority project for firewall-test on team ${team?.slug}`
    );
    expect(output).toContain(
      `project priority enable firewall-test --scope ${quoteArg(team?.slug ?? '')}`
    );
    expect(output).not.toContain('(401)');
  });

  it('turns a Priority project 401 on a managed bot edit into an upsell', async () => {
    useListFirewallConfigs(createConfig(), null);
    client.scenario.patch(
      '/v1/security/firewall/config/draft',
      (_req: any, res: any) => {
        res.status(401).json({
          error: {
            code: 'unauthorized',
            message: 'This feature requires a Priority project',
          },
        });
      }
    );

    client.setArgv(
      'firewall',
      'rules',
      'edit',
      'ai-bots',
      '--action',
      'deny',
      '--yes'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    const output = client.stderr.getFullOutput();
    const team = teamCache.get('team_dummy');
    expect(output).toContain(
      `This rule requires a Priority project for firewall-test on team ${team?.slug}`
    );
    expect(output).toContain(
      `project priority enable firewall-test --scope ${quoteArg(team?.slug ?? '')}`
    );
    expect(output).not.toContain('(401)');
  });

  // ─── Help ──────────────────────────────────────────────────────────

  describe('help', () => {
    it('tracks help telemetry', async () => {
      client.setArgv('firewall', 'rules', 'edit', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);
    });
  });

  describe('subcommand name', () => {
    function useRuleUpdate() {
      useListFirewallConfigs(createConfig({ rules: [createRule(1)] }), null);
      usePatchDraft();
      useActivateConfig();
    }

    it('warns when invoked as the deprecated edit name', async () => {
      useRuleUpdate();
      client.setArgv(
        'firewall',
        'rules',
        'edit',
        'rule_001',
        '--action',
        'log',
        '--yes'
      );

      expect(await firewall(client)).toBe(0);
      await expect(client.stderr).toOutput(
        '`vercel firewall rules edit` is deprecated. Use `vercel firewall rules update`.'
      );
    });

    it('does not warn when invoked as update', async () => {
      useRuleUpdate();
      client.setArgv(
        'firewall',
        'rules',
        'update',
        'rule_001',
        '--action',
        'log',
        '--yes'
      );

      expect(await firewall(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
    });
  });
});
