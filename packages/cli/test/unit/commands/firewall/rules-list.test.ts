import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  createConfig,
  createRule,
  createChange,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall rules list', () => {
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

  it('should show no rules when empty', async () => {
    useListFirewallConfigs(createConfig(), null);
    client.setArgv('firewall', 'rules', 'list');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('No custom rules configured');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should list active rules in table format', async () => {
    const active = createConfig({
      rules: [createRule(1), createRule(2), createRule(3)],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'list');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Showing live configuration');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should annotate draft additions', async () => {
    const active = createConfig({
      rules: [createRule(1)],
    });
    const draft = createConfig({
      id: 'draft',
      rules: [createRule(1), createRule(2)],
      changes: [
        createChange('rules.insert', {
          id: 'rule_002',
          value: { name: 'Test Rule 2' },
        }),
      ],
    });
    useListFirewallConfigs(active, draft);
    client.setArgv('firewall', 'rules', 'list');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('unpublished rule change');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should show expanded view with --expand', async () => {
    const active = createConfig({
      rules: [createRule(1)],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'list', '--expand');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Showing live configuration');
    expect(await exitCodePromise).toEqual(0);
  });

  it('should output JSON with --json flag', async () => {
    const active = createConfig({
      rules: [createRule(1)],
    });
    useListFirewallConfigs(active, null);
    client.setArgv('firewall', 'rules', 'list', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
  });

  it('tracks help telemetry', async () => {
    client.setArgv('firewall', 'rules', 'list', '--help');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(2);
  });
});
