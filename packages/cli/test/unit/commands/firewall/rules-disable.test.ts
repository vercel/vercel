import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  useListTeamFirewallConfigs,
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
    expect(await exitCodePromise).toEqual(2);
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

  it('points a Priority-only disable at remove, not priority enable', async () => {
    const rule = {
      ...createRule(1),
      conditionGroup: [
        {
          conditions: [
            {
              type: 'bot_category' as const,
              op: 'eq' as const,
              value: 'ai_scraper',
            },
          ],
        },
      ],
    };
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

    client.setArgv('firewall', 'rules', 'disable', rule.name, '--yes');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    const output = client.stderr.getFullOutput();
    const team = teamCache.get('team_dummy');
    expect(output).toContain(
      `This rule cannot be disabled while firewall-test is not a Priority project`
    );
    expect(output).toContain(
      `firewall rules remove ${quoteArg(rule.name)} --scope ${quoteArg(team?.slug ?? '')}`
    );
    expect(output).not.toContain('--yes');
    expect(output).not.toContain('project priority enable');
    expect(output).not.toContain('--team-level');
    expect(output).not.toContain('--project');
    expect(output).not.toContain('(401)');
  });

  it('keeps an explicit --project when a disable is refused', async () => {
    const rule = {
      ...createRule(1),
      conditionGroup: [
        {
          conditions: [
            {
              type: 'bot_category' as const,
              op: 'eq' as const,
              value: 'ai_scraper',
            },
          ],
        },
      ],
    };
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject({
      ...defaultProject,
      id: 'other-firewall-project',
      name: 'other-firewall',
      accountId: 'team_dummy',
    });
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

    client.setArgv(
      'firewall',
      'rules',
      'disable',
      rule.name,
      '--project',
      'other-firewall',
      '--yes'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    const output = client.stderr.getFullOutput();
    const team = teamCache.get('team_dummy');
    expect(output).toContain(
      `firewall rules remove ${quoteArg(rule.name)} --scope ${quoteArg(team?.slug ?? '')} --project other-firewall`
    );
    expect(output).not.toContain('--yes');
    expect(output).not.toContain('project priority enable');
  });

  it('keeps --team-level when a team firewall disable is refused', async () => {
    const rule = {
      ...createRule(1),
      conditionGroup: [
        {
          conditions: [
            {
              type: 'bot_category' as const,
              op: 'eq' as const,
              value: 'ai_scraper',
            },
          ],
        },
      ],
    };
    useListTeamFirewallConfigs(createConfig({ rules: [rule] }), null);
    client.scenario.patch(
      '/v1/security/firewall/team-config/draft',
      (_req: any, res: any) => {
        res.status(401).json({
          error: {
            code: 'unauthorized',
            message: 'This feature requires a Priority project',
          },
        });
      }
    );

    client.config.currentTeam = 'team_dummy';
    client.setArgv(
      'firewall',
      'rules',
      'disable',
      rule.name,
      '--team-level',
      '--yes'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    const output = client.stderr.getFullOutput();
    const team = teamCache.get('team_dummy');
    expect(output).toContain(
      `firewall rules remove ${quoteArg(rule.name)} --scope ${quoteArg(team?.slug ?? '')} --team-level`
    );
    expect(output).not.toContain('--yes');
    expect(output).not.toContain('project priority enable');
  });
});
