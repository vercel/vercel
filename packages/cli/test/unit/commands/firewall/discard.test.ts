import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  useDeleteDraft,
  capturedRequests,
  createConfig,
  createChange,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall discard', () => {
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
      client.setArgv('firewall', 'discard', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:discard',
        },
      ]);
    });
  });

  it('should warn when no draft to discard', async () => {
    useListFirewallConfigs(createConfig(), null);

    client.setArgv('firewall', 'discard');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No draft changes to discard.');
  });

  it('should discard draft changes with --yes', async () => {
    const draft = createConfig({
      id: 'draft',
      changes: [
        createChange('rules.insert', {
          value: { name: 'New Rule' },
        }),
      ],
    });
    useListFirewallConfigs(createConfig(), draft);
    useDeleteDraft();

    client.setArgv('firewall', 'discard', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Draft changes discarded');
    expect(await exitCodePromise).toEqual(0);
    expect(capturedRequests.deleteDraft).toBe(true);
  });

  it('should show changes before discarding', async () => {
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
    useDeleteDraft();

    client.setArgv('firewall', 'discard', '--yes');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Changes to be discarded (2)');
    expect(await exitCodePromise).toEqual(0);
  });
});
