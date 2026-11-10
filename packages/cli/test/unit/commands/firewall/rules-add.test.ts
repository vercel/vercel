import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { addInteractive } from '../../../../src/commands/firewall/rules/add-interactive';
import { projectScope } from '../../../../src/util/firewall/scope';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  useActivateConfig,
  usePatchDraft,
  useGenerateFirewallRule,
  useGenerateFirewallRuleError,
  capturedRequests,
  createConfig,
  createChange,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { setTeamBillingPlan, useTeams } from '../../../mocks/team';
import { teamCache } from '../../../../src/util/teams/get-team-by-id-or-slug';
import { quoteArg } from '../../../../src/util/flags/quote-arg';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';

describe('firewall rules add', () => {
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

  // ─── Flag mode: happy paths ────────────────────────────────────────

  describe('flag mode', () => {
    it('should create a simple deny rule', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Block test path',
        '--condition',
        '{"type":"path","op":"pre","value":"/test"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Block test path" staged');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.patchDraft?.action).toBe('rules.insert');
      expect(
        (capturedRequests.patchDraft?.value as any)?.action?.mitigate?.action
      ).toBe('deny');
      expect(
        (capturedRequests.patchDraft?.value as any)?.conditionGroup
      ).toHaveLength(1);
    });

    it.each([
      '--project',
      '-p',
    ])('keeps %s in the publish suggestion as --project', async flag => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();
      client.cwd = setupTmpDir();
      client.config.currentTeam = 'team_dummy';
      useProject({
        ...defaultProject,
        id: 'other-firewall',
        name: 'other-firewall',
        accountId: 'team_dummy',
      });

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Block test path',
        '--condition',
        '{"type":"path","op":"pre","value":"/test"}',
        '--action',
        'deny',
        flag,
        'other-firewall',
        '--yes'
      );
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);
      const output = client.stderr.getFullOutput().replace(/\s+/g, ' ');
      expect(output).toContain(
        'Run vercel firewall publish --project other-firewall to make it live'
      );
      expect(output).toContain(
        'vercel firewall discard --project other-firewall to undo'
      );
      expect(client.telemetryEventStore.readonlyEvents).toContainEqual(
        expect.objectContaining({
          key: 'option:project',
          value: '[REDACTED]',
        })
      );
    });

    it('should create a multi-condition AND rule', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Multi condition',
        '--condition',
        '{"type":"user_agent","op":"sub","value":"crawler"}',
        '--condition',
        '{"type":"geo_country","op":"inc","value":"DE,FR"}',
        '--action',
        'challenge',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Multi condition" staged');
      expect(await exitCodePromise).toEqual(0);
      // 2 conditions in same group (AND)
      const cg = (capturedRequests.patchDraft?.value as any)?.conditionGroup;
      expect(cg).toHaveLength(1);
      expect(cg[0].conditions).toHaveLength(2);
    });

    it('should create a rule with OR groups', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'OR group rule',
        '--condition',
        '{"type":"user_agent","op":"sub","value":"bot"}',
        '--or',
        '--condition',
        '{"type":"ip_address","op":"eq","value":"1.2.3.4"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "OR group rule" staged');
      expect(await exitCodePromise).toEqual(0);
      // 2 separate OR groups
      expect(
        (capturedRequests.patchDraft?.value as any)?.conditionGroup
      ).toHaveLength(2);
    });

    it('should create a rule with three OR groups', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Three groups',
        '--condition',
        '{"type":"path","op":"pre","value":"/api"}',
        '--or',
        '--condition',
        '{"type":"path","op":"pre","value":"/admin"}',
        '--or',
        '--condition',
        '{"type":"path","op":"pre","value":"/internal"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Three groups" staged');
      expect(await exitCodePromise).toEqual(0);
      expect(
        (capturedRequests.patchDraft?.value as any)?.conditionGroup
      ).toHaveLength(3);
    });

    it('should create a rule with key-based condition', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Header exists',
        '--condition',
        '{"type":"header","key":"Authorization","op":"ex"}',
        '--action',
        'bypass',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Header exists" staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should create a rule with nex operator (not exists)', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'No auth header',
        '--condition',
        '{"type":"header","key":"Authorization","op":"nex"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "No auth header" staged');
      expect(await exitCodePromise).toEqual(0);
      const cond = (capturedRequests.patchDraft?.value as any)
        ?.conditionGroup[0]?.conditions[0];
      expect(cond.op).toBe('nex');
      expect(cond.key).toBe('Authorization');
      expect(cond.value).toBeUndefined();
    });

    it('should create a rule with ninc operator (not any of)', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Block countries',
        '--condition',
        '{"type":"geo_country","op":"ninc","value":"US,CA,GB"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Block countries" staged');
      expect(await exitCodePromise).toEqual(0);
      const cond = (capturedRequests.patchDraft?.value as any)
        ?.conditionGroup[0]?.conditions[0];
      expect(cond.op).toBe('ninc');
      expect(cond.value).toEqual(['US', 'CA', 'GB']);
    });

    it('should create a rule with negated condition', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Non-US traffic',
        '--condition',
        '{"type":"geo_country","op":"eq","neg":true,"value":"US"}',
        '--action',
        'challenge',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('does not equal US');
      expect(await exitCodePromise).toEqual(0);
      const cond = (capturedRequests.patchDraft?.value as any)
        ?.conditionGroup[0]?.conditions[0];
      expect(cond.op).toBe('eq');
      expect(cond.neg).toBe(true);
      expect(cond.value).toBe('US');
    });

    it('should create a rule with multi-value condition', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Block methods',
        '--condition',
        '{"type":"method","op":"inc","value":"DELETE,PUT,PATCH"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Block methods" staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should create a rate limit rule with all flags', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Rate limit API',
        '--condition',
        '{"type":"path","op":"pre","value":"/api"}',
        '--action',
        'rate_limit',
        '--rate-limit-algo',
        'fixed_window',
        '--rate-limit-window',
        '60',
        '--rate-limit-requests',
        '100',
        '--rate-limit-keys',
        'ip',
        '--rate-limit-keys',
        'ja4',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Rate limit API" staged');
      expect(await exitCodePromise).toEqual(0);
      const rl = (capturedRequests.patchDraft?.value as any)?.action?.mitigate
        ?.rateLimit;
      expect(rl).toBeDefined();
      expect(rl.window).toBe(60);
      expect(rl.limit).toBe(100);
      expect(rl.keys).toEqual(['ip', 'ja4']);
      expect(rl.action).toBe('rate_limit'); // default exceeded action
    });

    it('should create a rate limit rule with explicit --rate-limit-action', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'RL deny action',
        '--condition',
        '{"type":"path","op":"pre","value":"/api"}',
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
      await expect(client.stderr).toOutput('Rule "RL deny action" staged');
      expect(await exitCodePromise).toEqual(0);
      const rl2 = (capturedRequests.patchDraft?.value as any)?.action?.mitigate
        ?.rateLimit;
      expect(rl2.action).toBe('deny');
    });

    it('should create a rate limit rule with defaults (algo and keys)', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Rate limit default',
        '--condition',
        '{"type":"path","op":"pre","value":"/api"}',
        '--action',
        'rate_limit',
        '--rate-limit-window',
        '30',
        '--rate-limit-requests',
        '50',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Rate limit default" staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should create a redirect rule', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Redirect old path',
        '--condition',
        '{"type":"path","op":"pre","value":"/old"}',
        '--action',
        'redirect',
        '--redirect-url',
        '/new',
        '--redirect-permanent',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Redirect old path" staged');
      expect(await exitCodePromise).toEqual(0);
      const redirect = (capturedRequests.patchDraft?.value as any)?.action
        ?.mitigate?.redirect;
      expect(redirect).toBeDefined();
      expect(redirect.location).toBe('/new');
      expect(redirect.permanent).toBe(true);
    });

    it('should create a redirect rule (temporary by default)', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Temp redirect',
        '--condition',
        '{"type":"path","op":"pre","value":"/temp"}',
        '--action',
        'redirect',
        '--redirect-url',
        '/new',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Temp redirect" staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should create a rule with duration', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Deny with duration',
        '--condition',
        '{"type":"ip_address","op":"eq","value":"1.2.3.4"}',
        '--action',
        'deny',
        '--duration',
        '1h',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Duration: 1h');
      expect(await exitCodePromise).toEqual(0);
      expect(
        (capturedRequests.patchDraft?.value as any)?.action?.mitigate
          ?.actionDuration
      ).toBe('1h');
    });

    it.each([
      ['--no-enable', false],
      ['--disabled', true],
    ])('should create an inactive rule with %s', async (flag, deprecated) => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Inactive rule',
        '--condition',
        '{"type":"path","op":"pre","value":"/test"}',
        '--action',
        'log',
        flag,
        '--description',
        'Test description',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Inactive rule');
      expect(await exitCodePromise).toEqual(0);
      expect((capturedRequests.patchDraft?.value as any)?.active).toBe(false);
      expect((capturedRequests.patchDraft?.value as any)?.description).toBe(
        'Test description'
      );
      const stderr = client.stderr.getFullOutput();
      if (deprecated) {
        expect(stderr).toContain('--disabled is deprecated. Use --no-enable.');
      } else {
        expect(stderr).not.toContain('deprecated');
      }
    });

    it('should create a log rule', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Log rule',
        '--condition',
        '{"type":"method","op":"eq","value":"DELETE"}',
        '--action',
        'log',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Log rule" staged');
      expect(await exitCodePromise).toEqual(0);
      expect(
        (capturedRequests.patchDraft?.value as any)?.action?.mitigate?.action
      ).toBe('log');
    });

    it('should create a bypass rule', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Bypass rule',
        '--condition',
        '{"type":"ip_address","op":"eq","value":"10.0.0.0/24"}',
        '--action',
        'bypass',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Bypass rule" staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should show preview before creating', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Preview test',
        '--condition',
        '{"type":"path","op":"pre","value":"/api"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      // Preview should show the condition
      await expect(client.stderr).toOutput('path starts with /api');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should handle colon in condition value', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Colon value',
        '--condition',
        '{"type":"header","key":"X-Forward","op":"eq","value":"1.2.3.4:8080"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Colon value" staged');
      expect(await exitCodePromise).toEqual(0);
    });
  });

  // ─── Flag mode: validation errors ──────────────────────────────────

  describe('flag mode validation', () => {
    it('should error when name is missing', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--condition',
        '{"type":"path","op":"pre","value":"/test"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Missing rule name');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error when --action is missing', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"pre","value":"/test"}',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Missing --action');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on invalid action', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"pre","value":"/test"}',
        '--action',
        'invalid',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Invalid action');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on invalid condition JSON', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        'not-json',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Invalid condition JSON');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on invalid operator in JSON', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"badop","value":"/test"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Invalid operator');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on missing value for string operator', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"pre"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('requires a "value" field');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on missing key for header type', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"header","op":"ex"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('requires a "key" field');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on missing type in condition JSON', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"op":"eq","value":"test"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('"type" field');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on missing op in condition JSON', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","value":"/test"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('"op" field');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on invalid duration', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"pre","value":"/test"}',
        '--action',
        'deny',
        '--duration',
        '2h',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Invalid duration');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error when rate limit missing --rate-limit-window', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"pre","value":"/api"}',
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

    it('should error when rate limit missing --rate-limit-requests', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"pre","value":"/api"}',
        '--action',
        'rate_limit',
        '--rate-limit-window',
        '60',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('--rate-limit-requests is required');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on --or before any conditions', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--or',
        '--condition',
        '{"type":"path","op":"pre","value":"/test"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('cannot be placed before');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on redirect without --redirect-url', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"pre","value":"/old"}',
        '--action',
        'redirect',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('requires --redirect-url');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on invalid redirect URL', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"pre","value":"/old"}',
        '--action',
        'redirect',
        '--redirect-url',
        'not-a-url',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('must start with');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should accept redirect URL starting with /', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Redirect path',
        '--condition',
        '{"type":"path","op":"pre","value":"/old"}',
        '--action',
        'redirect',
        '--redirect-url',
        '/new-path',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should accept redirect URL starting with https://', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Redirect URL',
        '--condition',
        '{"type":"path","op":"pre","value":"/old"}',
        '--action',
        'redirect',
        '--redirect-url',
        'https://example.com/new',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should error on invalid regex in condition', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"re","value":"[invalid"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Invalid regex pattern');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should accept valid regex in condition', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Regex rule',
        '--condition',
        '{"type":"path","op":"re","value":"^/api/v[0-9]+"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should error on rate limit window exceeding max', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"pre","value":"/api"}',
        '--action',
        'rate_limit',
        '--rate-limit-window',
        '7200',
        '--rate-limit-requests',
        '100',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('maximum is 3600');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on rate limit requests exceeding max', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"pre","value":"/api"}',
        '--action',
        'rate_limit',
        '--rate-limit-window',
        '60',
        '--rate-limit-requests',
        '99999999',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('maximum is 10,000,000');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on invalid --rate-limit-action', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"pre","value":"/api"}',
        '--action',
        'rate_limit',
        '--rate-limit-window',
        '60',
        '--rate-limit-requests',
        '100',
        '--rate-limit-action',
        'invalid',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Invalid rate limit action');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error when --condition is specified without --action', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Test',
        '--condition',
        '{"type":"path","op":"pre","value":"/api"}',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Missing --action');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error in non-interactive mode without flags', async () => {
      client.setArgv('firewall', 'rules', 'add', 'Test Rule');
      (client.stdin as any).isTTY = false;
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Interactive mode is not available');
      expect(await exitCodePromise).toEqual(2);
    });
  });

  // ─── JSON mode ─────────────────────────────────────────────────────

  describe('JSON mode', () => {
    it('should create a rule from valid JSON', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--data',
        JSON.stringify({
          name: 'JSON rule',
          active: true,
          conditionGroup: [
            { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
          ],
          action: { mitigate: { action: 'deny' } },
        }),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "JSON rule" staged');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.patchDraft?.action).toBe('rules.insert');
      expect((capturedRequests.patchDraft?.value as any)?.name).toBe(
        'JSON rule'
      );
    });

    it('accepts --json, the deprecated name for --data', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--json',
        JSON.stringify({
          name: 'JSON rule',
          active: true,
          conditionGroup: [
            { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
          ],
          action: { mitigate: { action: 'deny' } },
        }),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        '! --json is deprecated for rule payloads. Use --data.'
      );
      expect(await exitCodePromise).toEqual(0);
      expect((capturedRequests.patchDraft?.value as any)?.name).toBe(
        'JSON rule'
      );
    });

    it('rejects --data with --json', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--data',
        '{"name":"a"}',
        '--json',
        '{"name":"b"}',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput("Can't use --data with --json.");
      expect(await exitCodePromise).toEqual(2);
    });

    it('should create a complex JSON rule with rate limit', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--data',
        JSON.stringify({
          name: 'Complex JSON',
          active: true,
          conditionGroup: [
            {
              conditions: [
                { type: 'path', op: 'pre', value: '/api' },
                { type: 'method', op: 'inc', value: ['POST', 'PUT'] },
              ],
            },
            {
              conditions: [{ type: 'ip_address', op: 'eq', value: '1.2.3.4' }],
            },
          ],
          action: {
            mitigate: {
              action: 'rate_limit',
              rateLimit: {
                algo: 'fixed_window',
                window: 60,
                limit: 100,
                keys: ['ip'],
              },
            },
          },
        }),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Complex JSON" staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should error on invalid JSON string', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--data',
        '{bad json',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Invalid JSON');
      expect(await exitCodePromise).toEqual(2);
    });

    it('should error when JSON missing name', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--data',
        JSON.stringify({
          conditionGroup: [
            { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
          ],
          action: { mitigate: { action: 'deny' } },
        }),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('"name" field');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error when JSON missing conditionGroup', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--data',
        JSON.stringify({
          name: 'Test',
          action: { mitigate: { action: 'deny' } },
        }),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('"conditionGroup" field');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error when JSON missing action', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--data',
        JSON.stringify({
          name: 'Test',
          conditionGroup: [
            { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
          ],
        }),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('"action" field');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error when conditionGroup entry missing conditions array', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--data',
        JSON.stringify({
          name: 'Test',
          conditionGroup: [{ notConditions: [] }],
          action: { mitigate: { action: 'deny' } },
        }),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        'conditionGroup[0] must have a "conditions" array'
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error when condition missing type field', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--data',
        JSON.stringify({
          name: 'Test',
          conditionGroup: [{ conditions: [{ op: 'eq', value: 'test' }] }],
          action: { mitigate: { action: 'deny' } },
        }),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        'conditionGroup[0].conditions[0] must have a "type" field'
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error when action missing mitigate field', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--data',
        JSON.stringify({
          name: 'Test',
          conditionGroup: [
            { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
          ],
          action: { notMitigate: {} },
        }),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        'action must have a "mitigate" field'
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error when name too long', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--data',
        JSON.stringify({
          name: 'a'.repeat(161),
          conditionGroup: [
            { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
          ],
          action: { mitigate: { action: 'deny' } },
        }),
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('160 characters or less');
      expect(await exitCodePromise).toEqual(1);
    });
  });

  // ─── Mutual exclusivity ────────────────────────────────────────────

  describe('mutual exclusivity', () => {
    it('should error on --ai + --condition', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--ai',
        'Block bots',
        '--condition',
        '{"type":"path","op":"pre","value":"/test"}',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        'Cannot use --ai, --data, and --condition together'
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on --data + --condition', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--data',
        '{"name":"test"}',
        '--condition',
        '{"type":"path","op":"pre","value":"/test"}',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        'Cannot use --ai, --data, and --condition together'
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error on --ai + --data', async () => {
      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--ai',
        'Block bots',
        '--data',
        '{"name":"test"}',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        'Cannot use --ai, --data, and --condition together'
      );
      expect(await exitCodePromise).toEqual(1);
    });
  });

  // ─── AI mode ───────────────────────────────────────────────────────

  describe('AI mode', () => {
    it('should block AI mode in non-interactive mode', async () => {
      client.setArgv('firewall', 'rules', 'add', '--ai', 'Block bots', '--yes');
      (client.stdin as any).isTTY = false;
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        'AI mode is not available in non-interactive mode'
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('should create a rule from AI with --yes', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();
      useGenerateFirewallRule();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--ai',
        'Rate limit API endpoints to 100 per minute',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "AI Generated Rule" staged');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.patchDraft?.action).toBe('rules.insert');
      expect((capturedRequests.patchDraft?.value as any)?.name).toBe(
        'AI Generated Rule'
      );
    });

    it('turns a Priority project 401 into an upsell', async () => {
      useListFirewallConfigs(createConfig(), null);
      useGenerateFirewallRule();
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
        'add',
        '--ai',
        'Rate limit /api to 100 requests per minute by IP',
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

    it('should create a rule with specific AI-generated conditions', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();
      useGenerateFirewallRule({
        name: 'Rate limit /api',
        description: 'Limit API requests',
        active: true,
        id: 'ai_generated',
        conditionGroup: [
          {
            conditions: [
              { type: 'path', op: 'pre', value: '/api' },
              { type: 'method', op: 'inc', value: ['POST', 'PUT'] },
            ],
          },
        ],
        action: {
          mitigate: {
            action: 'rate_limit',
            rateLimit: {
              algo: 'fixed_window',
              window: 60,
              limit: 100,
              keys: ['ip'],
            },
            redirect: null,
            actionDuration: null,
          },
        },
      });

      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--ai',
        'Rate limit API to 100 requests per minute',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Rate limit /api" staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should show error when AI returns error field', async () => {
      useGenerateFirewallRule(undefined, 'Too vague — please be more specific');

      client.setArgv(
        'firewall',
        'rules',
        'add',
        '--ai',
        'do something',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Too vague');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should block AI mode when non-TTY even with API mock', async () => {
      useGenerateFirewallRuleError(500);
      (client.stdin as any).isTTY = false;

      client.setArgv('firewall', 'rules', 'add', '--ai', 'Block bots', '--yes');
      const exitCodePromise = firewall(client);
      // AI is blocked before the API call is ever made
      await expect(client.stderr).toOutput(
        'AI mode is not available in non-interactive mode'
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('should show retry menu when AI API fails in interactive mode', async () => {
      useGenerateFirewallRuleError(500);

      client.setArgv('firewall', 'rules', 'add', '--ai', 'Block bots');
      const exitCodePromise = firewall(client);

      // Should show retry/cancel menu
      await expect(client.stderr).toOutput('Generation failed');
      // Select "Cancel"
      client.stdin.write('\x1B[B'); // down to Cancel
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Canceled');
      expect(await exitCodePromise).toEqual(0);
    });
  });

  // ─── offerAutoPublish ──────────────────────────────────────────────

  describe('offerAutoPublish', () => {
    it('should show "only staged change" when no prior draft', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'First change',
        '--condition',
        '{"type":"path","op":"pre","value":"/test"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('This change is staged');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should warn about existing draft changes', async () => {
      const draft = createConfig({
        id: 'draft',
        changes: [
          createChange('rules.insert', {
            value: { name: 'Existing' },
          }),
        ],
      });
      useListFirewallConfigs(createConfig(), draft);
      usePatchDraft();

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Second change',
        '--condition',
        '{"type":"path","op":"pre","value":"/test"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('other draft changes');
      expect(await exitCodePromise).toEqual(0);
    });
  });

  // ─── Non-interactive / agent mode ──────────────────────────────────

  describe('non-interactive mode', () => {
    it('should work with flags in non-TTY mode', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();
      (client.stdin as any).isTTY = false;

      client.setArgv(
        'firewall',
        'rules',
        'add',
        'Non-TTY rule',
        '--condition',
        '{"type":"path","op":"pre","value":"/test"}',
        '--action',
        'deny',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Rule "Non-TTY rule" staged');
      expect(await exitCodePromise).toEqual(0);
    });
  });

  // ─── Help + telemetry ──────────────────────────────────────────────

  describe('help', () => {
    it('tracks help telemetry', async () => {
      client.setArgv('firewall', 'rules', 'add', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);
    });
  });

  // ─── Interactive mode ──────────────────────────────────────────────

  describe('interactive mode', () => {
    it('should create a rule via AI interactive mode', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();
      useGenerateFirewallRule();

      client.setArgv('firewall', 'rules', 'add');
      const exitCodePromise = firewall(client);

      // Select "Describe what you want (AI-powered)" (first option)
      await expect(client.stderr).toOutput(
        'How would you like to create the rule?'
      );
      client.stdin.write('\n'); // select first = AI

      // Enter prompt
      await expect(client.stderr).toOutput('Describe the rule');
      client.stdin.write('Challenge requests with suspicious user agents\n');

      // AI generates, shows preview, review menu
      await expect(client.stderr).toOutput('What would you like to do?');
      client.stdin.write('\n'); // select "Create this rule" (first)

      // offerAutoPublish will prompt since no existing draft
      await expect(client.stderr).toOutput('Publish to production now?');
      client.stdin.write('n\n'); // decline publish

      expect(await exitCodePromise).toEqual(0);
    });

    it('should allow discarding AI-generated rule', async () => {
      useGenerateFirewallRule();

      client.setArgv('firewall', 'rules', 'add');
      const exitCodePromise = firewall(client);

      // Select AI
      await expect(client.stderr).toOutput(
        'How would you like to create the rule?'
      );
      client.stdin.write('\n');

      // Enter prompt
      await expect(client.stderr).toOutput('Describe the rule');
      client.stdin.write('Block bots\n');

      // Preview shows, select "Discard" (4th option)
      await expect(client.stderr).toOutput('What would you like to do?');
      client.stdin.write('\x1B[B'); // down
      client.stdin.write('\x1B[B'); // down
      client.stdin.write('\x1B[B'); // down to "Discard"
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Discarded');
      expect(await exitCodePromise).toEqual(0);
    });

    it('turns a manual add of a bot condition into the Priority upsell', async () => {
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

      const exitCodePromise = addInteractive(
        client,
        projectScope(
          { id: 'firewall-test-project', name: 'firewall-test' },
          'team_dummy',
          'dummy-team'
        ),
        {
          prePopulated: {
            name: 'Block bots',
            conditionGroup: [
              {
                conditions: [
                  { type: 'bot_category', op: 'eq', value: 'ai_scraper' },
                ],
              },
            ],
            action: {
              mitigate: {
                action: 'deny',
                rateLimit: null,
                redirect: null,
                actionDuration: null,
              },
            },
          },
        }
      );

      await expect(client.stderr).toOutput('Rule name:');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Description');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('What next?');
      client.stdin.write('\x1B[B\x1B[B\n');
      await expect(client.stderr).toOutput('Action:');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Action duration');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Create this rule?');
      client.stdin.write('y\n');

      expect(await exitCodePromise).toEqual(1);
      const output = client.stderr.getFullOutput();
      expect(output).toContain(
        'This rule requires a Priority project for firewall-test on team dummy-team'
      );
      expect(output).toContain(
        'project priority enable firewall-test --scope dummy-team'
      );
      expect(output).not.toContain('(401)');
    });
  });

  it('turns a Priority project 401 into an upsell', async () => {
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
      'add',
      'Block bot category',
      '--condition',
      '{"type":"bot_category","op":"eq","value":"ai_scraper"}',
      '--action',
      'deny',
      '--yes'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    const output = client.stderr.getFullOutput();
    const team = teamCache.get('team_dummy');
    expect(team?.slug).toBeTruthy();
    expect(output).toContain(
      `This rule requires a Priority project for firewall-test on team ${team?.slug}`
    );
    expect(output).toContain(
      `project priority enable firewall-test --scope ${quoteArg(team?.slug ?? '')}`
    );
    expect(output).not.toContain('--project');
    expect(output).not.toContain('--non-interactive');
    expect(output).not.toContain('A person must');
    expect(output).not.toContain('cannot be automated');
    expect(output).not.toContain('(401)');
    expect(output).not.toContain('This feature requires a Priority project');
    expect(output).not.toContain('https://vercel.com');
  });

  it('returns a structured plan error with --json', async () => {
    client.scenario.get(
      '/v1/security/firewall/config',
      (_req: any, res: any) => {
        res.status(401).json({
          error: {
            code: 'unauthorized',
            message: 'This feature requires a Priority project',
          },
        });
      }
    );

    client.setArgv('firewall', 'rules', 'list', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    const payload = JSON.parse(client.stdout.getFullOutput());
    const team = teamCache.get('team_dummy');
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'plan_upgrade_required',
      userActionRequired: true,
      scope: team?.slug,
    });
    expect(payload.data.project).toEqual({
      id: 'firewall-test-project',
      name: 'firewall-test',
    });
    expect(payload.data.team.slug).toBe(team?.slug);
    expect(payload.data.team.slug).not.toBe('firewall-test');
    expect(payload.next?.[0]?.command).toContain(
      `project priority enable firewall-test --scope ${quoteArg(team?.slug ?? '')}`
    );
    expect(payload.next?.[0]?.command).not.toContain('--project');
    expect(payload.next?.[0]?.command).not.toContain('--non-interactive');
    expect(payload.message).toContain(
      `This rule requires a Priority project for firewall-test on team ${team?.slug}`
    );
    expect(client.stderr.getFullOutput()).not.toContain(
      'This rule requires a Priority project'
    );
    expect(client.stderr.getFullOutput()).not.toContain('(401)');
  });

  it('sends a Hobby team to buy pro for that team, not priority enable', async () => {
    setTeamBillingPlan('hobby');
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
      'add',
      'Block bot category',
      '--condition',
      '{"type":"bot_category","op":"eq","value":"ai_scraper"}',
      '--action',
      'deny',
      '--yes'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    const output = client.stderr.getFullOutput();
    const team = teamCache.get('team_dummy');
    expect(output).toContain(`buy pro --scope ${quoteArg(team?.slug ?? '')}`);
    expect(output).toContain(
      `project priority enable firewall-test --scope ${quoteArg(team?.slug ?? '')}`
    );
    expect(output).not.toContain('--project');
  });
});
