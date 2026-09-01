import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  useGetBypass,
  useGetBypassError,
  createConfig,
  createRule,
  createIpRule,
  createBypassRule,
  createChange,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';

describe('firewall overview', () => {
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
      client.setArgv('firewall', 'overview', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'firewall:overview',
        },
      ]);
    });
  });

  it('should show firewall overview when enabled with rules', async () => {
    const active = createConfig({
      firewallEnabled: true,
      rules: [createRule(1), createRule(2), createRule(3)],
      ips: [createIpRule(1), createIpRule(2)],
    });
    useListFirewallConfigs(active, null);
    useGetBypass([createBypassRule(1)]);

    client.setArgv('firewall', 'overview');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('2 active, 1 inactive (3 total)');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Enabled');
    expect(fullOutput).toContain('2 active, 1 inactive (3 total)');
    expect(fullOutput).toContain('IP Blocks');
    expect(fullOutput).toContain('System Bypass');
  });

  it('shows the overview for the project selected by --project', async () => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject({
      ...defaultProject,
      id: 'explicit-firewall',
      name: 'explicit-firewall',
      accountId: 'team_dummy',
    });
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);
    client.setArgv('firewall', 'overview', '--project', 'explicit-firewall');

    await expect(firewall(client)).resolves.toEqual(0);
    await expect(client.stderr).toOutput('Enabled');
  });

  it('should show firewall overview when disabled', async () => {
    const active = createConfig({
      firewallEnabled: false,
      rules: [],
      ips: [],
    });
    useListFirewallConfigs(active, null);
    useGetBypass([]);

    client.setArgv('firewall', 'overview');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Disabled');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Disabled');
    expect(fullOutput).toContain('0 active, 0 inactive (0 total)');
  });

  it('should show pending draft changes with content details', async () => {
    const active = createConfig({ firewallEnabled: true });
    const draft = createConfig({
      id: 'config_draft',
      changes: [
        createChange('rules.insert', {
          value: { name: 'New Rule' },
        }),
        createChange('ip.insert', {
          value: { ip: '1.2.3.4' },
        }),
      ],
    });
    useListFirewallConfigs(active, draft);
    useGetBypass([]);

    client.setArgv('firewall', 'overview');
    const exitCodePromise = firewall(client);
    // Wait for the last line of output — guarantees all previous lines were also printed
    await expect(client.stderr).toOutput('Added IP block 1.2.3.4');
    expect(await exitCodePromise).toEqual(0);

    // Verify the full output contains all expected draft details
    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('2 unpublished changes');
    expect(fullOutput).toContain('Added rule "New Rule"');
    expect(fullOutput).toContain('Added IP block 1.2.3.4');
  });

  it('should show not configured when no active config', async () => {
    useListFirewallConfigs(null, null);
    useGetBypass([]);

    client.setArgv('firewall', 'overview');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Not configured');
    expect(await exitCodePromise).toEqual(0);

    const fullOutput = client.stderr.getFullOutput();
    expect(fullOutput).toContain('Not configured');
  });

  it('should output JSON with --json flag', async () => {
    const active = createConfig({ firewallEnabled: true });
    useListFirewallConfigs(active, null);
    useGetBypass([]);

    client.setArgv('firewall', 'overview', '--json');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
  });

  describe('when IP Bypass is unavailable on the plan', () => {
    it('still renders the overview instead of failing', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypassError();

      client.setArgv('firewall', 'overview');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Not available on this plan');
      expect(await exitCodePromise).toEqual(0);

      const fullOutput = client.stderr.getFullOutput();
      // The rest of the overview is still reported.
      expect(fullOutput).toContain('Enabled');
      expect(fullOutput).toContain('IP Blocks');
      expect(fullOutput).not.toContain('IP Bypass is unavailable');
      // Bypass is gated; mitigations are not, so they must not be conflated.
      expect(fullOutput).not.toContain('System Mitigations:   Not available');
    });

    it('reports mitigation status from the project', async () => {
      // Mitigations are read from the project, which is not plan-gated, so the
      // status is still accurate when the bypass endpoint is unavailable.
      const resumesAt = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
      useProject({
        ...defaultProject,
        id: 'firewall-test-project',
        name: 'firewall-test',
        security: { firewallBypassIps: [`0.0.0.0/0#${resumesAt}`] },
      });
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypassError();

      client.setArgv('firewall', 'overview');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Paused');
      expect(await exitCodePromise).toEqual(0);

      expect(client.stderr.getFullOutput()).toContain('auto-resumes in');
    });

    it('reports bypass as null in JSON output', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypassError();

      client.setArgv('firewall', 'overview', '--json');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      // `null` distinguishes "unreadable" from `[]`, meaning "none configured".
      expect(json.bypass).toBeNull();
    });
  });

  it('still fails when the bypass request is denied by permissions', async () => {
    // The API checks permissions after the plan gate, so a 403 means the user
    // lacks access and must not be reported as a plan limitation.
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypassError(403, 'You do not have permission to read IP blocking.');

    client.setArgv('firewall', 'overview');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);

    expect(client.stderr.getFullOutput()).not.toContain(
      'Not available on this plan'
    );
  });
});
