import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import { useListFirewallConfigs, createConfig } from '../../../mocks/firewall';
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
  });

  it('lists the three managed bot rules with edit CTAs', async () => {
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
      'firewall rules edit bot-protection --action log'
    );
    expect(fullOutput).toContain('firewall rules edit ai-bots --action deny');
    expect(fullOutput).toContain(
      'firewall rules edit bot-id --action deep-analysis'
    );
    expect(fullOutput).not.toContain('firewall bot-management edit');
  });

  it('outputs JSON with --json', async () => {
    useListFirewallConfigs(createConfig(), null);
    client.setArgv('firewall', 'bot-management', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    const payload = JSON.parse((client.stdout as any).getFullOutput());
    expect(payload.managed).toHaveLength(3);
    expect(payload.managed[0].id).toEqual('bot-protection');
  });

  it('tracks help telemetry', async () => {
    client.setArgv('firewall', 'bot-management', '--help');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(2);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'flag:help',
        value: 'firewall:bot-management',
      },
    ]);
  });
});
