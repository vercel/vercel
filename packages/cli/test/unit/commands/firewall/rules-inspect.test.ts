import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  createConfig,
  createRule,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall rules inspect', () => {
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

  it('should inspect a rule by name', async () => {
    const active = createConfig({
      rules: [createRule(1), createRule(2)],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'inspect', 'Test Rule 1');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Test Rule 1');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should inspect a rule by ID', async () => {
    const active = createConfig({
      rules: [createRule(1)],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'inspect', 'rule_001');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Test Rule 1');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should inspect a rule by partial name', async () => {
    const active = createConfig({
      rules: [createRule(1)],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'inspect', 'Test Rule');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Test Rule 1');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should error when rule not found', async () => {
    useListFirewallConfigs(createConfig({ rules: [] }), null);
    client.setArgv('firewall', 'rules', 'inspect', 'nonexistent');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No rule found');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should error when identifier is missing', async () => {
    client.setArgv('firewall', 'rules', 'inspect');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Missing required argument');
    expect(await exitCodePromise).toEqual(1);
  });

  it('should output JSON with --json flag', async () => {
    const active = createConfig({
      rules: [createRule(1)],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'inspect', 'Test Rule 1', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
  });

  it('tracks help telemetry', async () => {
    client.setArgv('firewall', 'rules', 'inspect', '--help');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(2);
  });
});
