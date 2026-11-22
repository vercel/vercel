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
import { teamCache } from '../../../../src/util/teams/get-team-by-id-or-slug';
import { quoteArg } from '../../../../src/util/flags/quote-arg';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';

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

  it('enables a rule for the project selected by --project', async () => {
    const active = createConfig({ rules: [createRule(3)] });
    useListFirewallConfigs(active, null);
    usePatchDraft();
    useActivateConfig();
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject({
      ...defaultProject,
      id: 'explicit-firewall',
      name: 'explicit-firewall',
      accountId: 'team_dummy',
    });
    client.setArgv(
      'firewall',
      'rules',
      'enable',
      'Test Rule 3',
      '--project',
      'explicit-firewall',
      '--yes'
    );

    await expect(firewall(client)).resolves.toEqual(0);
    await expect(client.stderr).toOutput('Enabled');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'option:project', value: '[REDACTED]' },
      { key: 'subcommand:rules', value: 'rules' },
      { key: 'subcommand:rules:enable', value: 'enable' },
    ]);
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
    expect(await exitCodePromise).toEqual(2);
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

  it('turns a Priority project 401 into an upsell', async () => {
    const rule = createRule(3);
    useListFirewallConfigs(createConfig({ rules: [rule] }), null);
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

    client.setArgv('firewall', 'rules', 'enable', rule.id, '--yes');
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
});
