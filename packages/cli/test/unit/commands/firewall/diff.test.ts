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

  it('should show "Disabled rule" when only active field toggled to false', async () => {
    const rule = {
      id: 'rule_001',
      name: 'My Rule',
      description: 'A test rule',
      active: true,
      conditionGroup: [
        { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
      ],
      action: { mitigate: { action: 'deny' } },
    };

    const active = createConfig({
      rules: [rule],
    });
    const draft = createConfig({
      id: 'draft',
      rules: [{ ...rule, active: false }],
      changes: [
        createChange('rules.update', {
          id: 'rule_001',
          value: { ...rule, active: false },
        }),
      ],
    });
    useListFirewallConfigs(active, draft);

    client.setArgv('firewall', 'diff');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Disabled rule "My Rule"');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should show "Enabled rule" when only active field toggled to true', async () => {
    const rule = {
      id: 'rule_002',
      name: 'Another Rule',
      description: '',
      active: false,
      conditionGroup: [
        { conditions: [{ type: 'method', op: 'eq', value: 'POST' }] },
      ],
      action: { mitigate: { action: 'challenge' } },
    };

    const active = createConfig({
      rules: [rule],
    });
    const draft = createConfig({
      id: 'draft',
      rules: [{ ...rule, active: true }],
      changes: [
        createChange('rules.update', {
          id: 'rule_002',
          value: { ...rule, active: true },
        }),
      ],
    });
    useListFirewallConfigs(active, draft);

    client.setArgv('firewall', 'diff');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Enabled rule "Another Rule"');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should show "Modified rule" when active and other fields changed', async () => {
    const rule = {
      id: 'rule_003',
      name: 'Complex Rule',
      description: 'Original description',
      active: true,
      conditionGroup: [
        { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
      ],
      action: { mitigate: { action: 'deny' } },
    };

    const active = createConfig({
      rules: [rule],
    });
    const draft = createConfig({
      id: 'draft',
      rules: [{ ...rule, active: false, name: 'Renamed Rule' }],
      changes: [
        createChange('rules.update', {
          id: 'rule_003',
          value: { ...rule, active: false, name: 'Renamed Rule' },
        }),
      ],
    });
    useListFirewallConfigs(active, draft);

    client.setArgv('firewall', 'diff');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Modified rule "Renamed Rule"');
    expect(await exitCodePromise).toEqual(0);
  });
});
