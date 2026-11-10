import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  createConfig,
  useFirewallActivity,
  firewallActivity,
  FIREWALL_ROLLUP_COLUMN,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall bot-management', () => {
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
    useFirewallActivity({
      byField: {
        botCategory: {
          summary: [
            { botCategory: 'ai_scraper', [FIREWALL_ROLLUP_COLUMN]: 1_200 },
            { botCategory: 'headless_chrome', [FIREWALL_ROLLUP_COLUMN]: 800 },
          ],
        },
      },
    });
  });

  it('lists the three managed bot rules with edit next steps', async () => {
    useListFirewallConfigs(
      createConfig({
        managedRules: {
          bot_filter: { active: true, action: 'challenge' },
          ai_bots: { active: false },
        },
        botIdEnabled: false,
      }),
      null
    );

    client.setArgv('firewall', 'bot-management');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Bot Protection');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('AI Bots');
    expect(fullOutput).toContain('BotID');
    expect(fullOutput).toContain('bot-protection');
    expect(fullOutput).toContain('ai-bots');
    expect(fullOutput).toContain('bot-id');
    expect(fullOutput).toContain(
      'firewall rules update bot-protection --action log'
    );
    expect(fullOutput).toContain('firewall rules update ai-bots --action deny');
    expect(fullOutput).toContain(
      'firewall rules update bot-id --action deep-analysis'
    );
    expect(fullOutput).not.toContain('firewall bot-management edit');
  });

  it('lists unknown bot traffic from request counts', async () => {
    useListFirewallConfigs(createConfig(), null);
    client.setArgv('firewall', 'bot-management');
    expect(await firewall(client)).toEqual(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('Unknown Bot Traffic');
    expect(out).toContain('ai_scraper');
    expect(out).toContain('headless_chrome');
    expect(out).toContain('firewall traffic inspect unknown-bot <category>');

    const bots = firewallActivity.queries.find(q =>
      (q.groupBy ?? []).includes('botCategory')
    );
    expect(bots?.metric).toEqual('vercel.request.count');
    expect(bots?.filter).toContain('botVerified!="pass"');
    expect(bots?.filter).toContain('botCategory!=""');
  });

  it('keeps the rules when unknown bot traffic is plan-gated', async () => {
    useListFirewallConfigs(createConfig(), null);
    useFirewallActivity({
      byField: { botCategory: { status: 402 } },
    });
    client.setArgv('firewall', 'bot-management');
    expect(await firewall(client)).toEqual(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('Bot Protection');
    expect(out).toContain('Unknown Bot Traffic');
    expect(out).toContain('Needs Observability Plus.');
    expect(out).not.toContain(
      'firewall traffic inspect unknown-bot <category>'
    );
  });

  it('outputs JSON with --json', async () => {
    useListFirewallConfigs(createConfig(), null);
    client.setArgv('firewall', 'bot-management', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const payload = JSON.parse((client.stdout as any).getFullOutput());
    expect(payload.managed).toHaveLength(3);
    expect(payload.managed[0].id).toEqual('bot-protection');
    expect(payload.managed[0]).toMatchObject({
      name: 'Bot Protection',
      action: 'off',
      wafRuleId: 'managed_bot_protection',
    });
    expect(payload.unknownBotTraffic.rows).toEqual([
      { value: 'ai_scraper', total: 1_200 },
      { value: 'headless_chrome', total: 800 },
    ]);
  });

  it('tracks help telemetry', async () => {
    client.setArgv('firewall', 'bot-management', '--help');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'flag:help',
        value: 'firewall:bot-management',
      },
    ]);
  });
});
