import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  useActivateConfig,
  capturedRequests,
  createConfig,
  createChange,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall publish', () => {
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
      client.setArgv('firewall', 'publish', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:publish',
        },
      ]);
    });
  });

  it('should warn when no draft to publish', async () => {
    useListFirewallConfigs(createConfig(), null);

    client.setArgv('firewall', 'publish');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No draft changes to publish.');
  });

  it('should publish draft changes with --yes', async () => {
    const draft = createConfig({
      id: 'draft',
      changes: [
        createChange('rules.insert', {
          value: { name: 'New Rule' },
        }),
      ],
    });
    useListFirewallConfigs(createConfig(), draft);
    useActivateConfig();

    client.setArgv('firewall', 'publish', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('published to production');
    expect(await exitCodePromise).toEqual(0);
    expect(capturedRequests.activate).toBeDefined();
  });

  it('should show changes before publishing', async () => {
    const draft = createConfig({
      id: 'draft',
      changes: [
        createChange('rules.insert', {
          value: { name: 'Block bots' },
        }),
        createChange('ip.insert', {
          value: { ip: '1.2.3.4' },
        }),
      ],
    });
    useListFirewallConfigs(createConfig(), draft);
    useActivateConfig();

    client.setArgv('firewall', 'publish', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Changes to be published (2)');
    expect(await exitCodePromise).toEqual(0);
  });
});
