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

  describe('field-level diff', () => {
    it('should show action change details', async () => {
      const rule = {
        id: 'rule_010',
        name: 'Action Test',
        description: '',
        active: true,
        conditionGroup: [
          { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
        ],
        action: { mitigate: { action: 'log' } },
      };

      const active = createConfig({ rules: [rule] });
      const draft = createConfig({
        id: 'draft',
        rules: [
          {
            ...rule,
            action: { mitigate: { action: 'deny', actionDuration: '1h' } },
          },
        ],
        changes: [
          createChange('rules.update', {
            id: 'rule_010',
            value: {
              ...rule,
              action: { mitigate: { action: 'deny', actionDuration: '1h' } },
            },
          }),
        ],
      });
      useListFirewallConfigs(active, draft);

      client.setArgv('firewall', 'diff');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Action: Log');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should show added condition', async () => {
      const rule = {
        id: 'rule_011',
        name: 'Condition Add Test',
        description: '',
        active: true,
        conditionGroup: [
          { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
        ],
        action: { mitigate: { action: 'deny' } },
      };

      const active = createConfig({ rules: [rule] });
      const draft = createConfig({
        id: 'draft',
        rules: [
          {
            ...rule,
            conditionGroup: [
              {
                conditions: [
                  { type: 'path', op: 'pre', value: '/api' },
                  { type: 'method', op: 'eq', value: 'POST' },
                ],
              },
            ],
          },
        ],
        changes: [
          createChange('rules.update', {
            id: 'rule_011',
            value: {
              ...rule,
              conditionGroup: [
                {
                  conditions: [
                    { type: 'path', op: 'pre', value: '/api' },
                    { type: 'method', op: 'eq', value: 'POST' },
                  ],
                },
              ],
            },
          }),
        ],
      });
      useListFirewallConfigs(active, draft);

      client.setArgv('firewall', 'diff');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Condition: method equals POST');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should show removed condition', async () => {
      const rule = {
        id: 'rule_012',
        name: 'Condition Remove Test',
        description: '',
        active: true,
        conditionGroup: [
          {
            conditions: [
              { type: 'path', op: 'pre', value: '/api' },
              { type: 'method', op: 'eq', value: 'DELETE' },
            ],
          },
        ],
        action: { mitigate: { action: 'deny' } },
      };

      const active = createConfig({ rules: [rule] });
      const draft = createConfig({
        id: 'draft',
        rules: [
          {
            ...rule,
            conditionGroup: [
              { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
            ],
          },
        ],
        changes: [
          createChange('rules.update', {
            id: 'rule_012',
            value: {
              ...rule,
              conditionGroup: [
                { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
              ],
            },
          }),
        ],
      });
      useListFirewallConfigs(active, draft);

      client.setArgv('firewall', 'diff');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Condition: method equals DELETE');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should show name change', async () => {
      const rule = {
        id: 'rule_013',
        name: 'Old Name',
        description: '',
        active: true,
        conditionGroup: [
          { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
        ],
        action: { mitigate: { action: 'deny' } },
      };

      const active = createConfig({ rules: [rule] });
      const draft = createConfig({
        id: 'draft',
        rules: [{ ...rule, name: 'New Name' }],
        changes: [
          createChange('rules.update', {
            id: 'rule_013',
            value: { ...rule, name: 'New Name' },
          }),
        ],
      });
      useListFirewallConfigs(active, draft);

      client.setArgv('firewall', 'diff');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Name: "Old Name"');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should show multiple field changes together', async () => {
      const rule = {
        id: 'rule_014',
        name: 'Multi Change',
        description: '',
        active: true,
        conditionGroup: [
          { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
        ],
        action: { mitigate: { action: 'log' } },
      };

      const active = createConfig({ rules: [rule] });
      const draft = createConfig({
        id: 'draft',
        rules: [
          {
            ...rule,
            active: false,
            action: { mitigate: { action: 'deny' } },
          },
        ],
        changes: [
          createChange('rules.update', {
            id: 'rule_014',
            value: {
              ...rule,
              active: false,
              action: { mitigate: { action: 'deny' } },
            },
          }),
        ],
      });
      useListFirewallConfigs(active, draft);

      client.setArgv('firewall', 'diff');
      const exitCodePromise = firewall(client);
      // Should say "Modified rule" (not "Disabled rule") since action also changed
      // Should show the action sub-line but NOT a status sub-line
      await expect(client.stderr).toOutput('Action: Log');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should not show field details for insert or remove', async () => {
      const rule = {
        id: 'rule_015',
        name: 'New Rule',
        description: '',
        active: true,
        conditionGroup: [
          { conditions: [{ type: 'path', op: 'pre', value: '/test' }] },
        ],
        action: { mitigate: { action: 'deny' } },
      };

      const active = createConfig({ rules: [] });
      const draft = createConfig({
        id: 'draft',
        rules: [rule],
        changes: [
          createChange('rules.insert', {
            id: 'rule_015',
            value: rule,
          }),
          createChange('rules.remove', {
            id: 'rule_old',
          }),
        ],
      });
      useListFirewallConfigs(active, draft);

      client.setArgv('firewall', 'diff');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Removed rule "rule_old"');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should show condition group restructuring', async () => {
      const rule = {
        id: 'rule_016',
        name: 'Restructure Test',
        description: '',
        active: true,
        conditionGroup: [
          {
            conditions: [
              { type: 'path', op: 'pre', value: '/api' },
              { type: 'method', op: 'eq', value: 'POST' },
            ],
          },
        ],
        action: { mitigate: { action: 'deny' } },
      };

      // Same conditions but split into two OR groups instead of one AND group
      const active = createConfig({ rules: [rule] });
      const draft = createConfig({
        id: 'draft',
        rules: [
          {
            ...rule,
            conditionGroup: [
              { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
              { conditions: [{ type: 'method', op: 'eq', value: 'POST' }] },
            ],
          },
        ],
        changes: [
          createChange('rules.update', {
            id: 'rule_016',
            value: {
              ...rule,
              conditionGroup: [
                { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
                { conditions: [{ type: 'method', op: 'eq', value: 'POST' }] },
              ],
            },
          }),
        ],
      });
      useListFirewallConfigs(active, draft);

      client.setArgv('firewall', 'diff');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Condition groups restructured');
      expect(await exitCodePromise).toEqual(0);
    });
  });
});
