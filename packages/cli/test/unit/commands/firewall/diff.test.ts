import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  createConfig,
  createChange,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall diff', () => {
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

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'diff', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:diff',
        },
      ]);
    });
  });

  it('should show no pending changes when no draft', async () => {
    useListFirewallConfigs(createConfig(), null);

    client.setArgv('firewall', 'diff');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No pending changes');
  });

  it('should show no pending changes when draft has empty changes', async () => {
    useListFirewallConfigs(
      createConfig(),
      createConfig({ id: 'draft', changes: [] })
    );

    client.setArgv('firewall', 'diff');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No pending changes');
  });

  it('should show pending changes', async () => {
    const draft = createConfig({
      id: 'draft',
      changes: [
        createChange('rules.insert', {
          value: { name: 'Block bots' },
        }),
        createChange('ip.remove', {
          id: 'ip_001',
        }),
      ],
    });
    useListFirewallConfigs(createConfig(), draft);

    client.setArgv('firewall', 'diff');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Removed IP block');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should output JSON with --json flag', async () => {
    const draft = createConfig({
      id: 'draft',
      changes: [
        createChange('rules.insert', {
          value: { name: 'Block bots' },
        }),
      ],
    });
    useListFirewallConfigs(createConfig(), draft);

    client.setArgv('firewall', 'diff', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
  });

  it('should output empty JSON array when no changes with --json', async () => {
    useListFirewallConfigs(createConfig(), null);

    client.setArgv('firewall', 'diff', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
  });
});
