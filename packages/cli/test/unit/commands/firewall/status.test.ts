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
import type { Project } from '@vercel-internals/types';
import { useTeams } from '../../../mocks/team';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';

describe('firewall status', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'firewall-test-project',
      name: 'firewall-test',
    });
    client.cwd = setupUnitFixture('commands/firewall');
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('firewall', 'status', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'firewall:status' },
      ]);
    });
  });

  it('tracks the subcommand', async () => {
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);

    client.setArgv('firewall', 'status');
    expect(await firewall(client)).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:status', value: 'status' },
    ]);
  });

  it('reports configuration in execution order', async () => {
    useListFirewallConfigs(
      createConfig({
        firewallEnabled: true,
        rules: [createRule(1), createRule(2), createRule(3)],
        ips: [createIpRule(1), createIpRule(2)],
        managedRules: {
          bot_protection: { active: true, action: 'challenge' },
          ai_bots: { active: true, action: 'log' },
          owasp: {
            active: true,
            ruleGroups: {
              sqli: { active: true },
              xss: { active: true },
              rce: { active: true },
              lfi: { active: false },
            },
          },
        },
      }),
      null
    );
    useGetBypass([createBypassRule(1)]);

    client.setArgv('firewall', 'status');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('OWASP');
    expect(await exitCodePromise).toEqual(0);

    const output = client.stderr.getFullOutput();
    expect(output).toContain('Enabled');
    expect(output).toContain('2 active, 1 inactive (3 total)');
    expect(output).toContain('Challenge');
    expect(output).toMatch(/AI Bots\s+Log/);
    expect(output).toMatch(/OWASP\s+On \(3 of 4 groups\)/);
    expect(output).not.toContain('requires Security+');
  });

  it('notes the upgrade needed when OWASP is unavailable', async () => {
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);

    client.setArgv('firewall', 'status');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('OWASP');
    expect(await exitCodePromise).toEqual(0);

    expect(client.stderr.getFullOutput()).toMatch(
      /OWASP\s+Off\s+· requires Security\+/
    );
  });

  it('does not ask for Security+ when the project already has it', async () => {
    // A distinct project, because `beforeEach` already registered a handler
    // for the default one and `client.scenario` is a router: the first
    // matching handler answers, so re-registering the same path is ignored.
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    // `/v9/projects/:id` reports project-level Security+ under `security`.
    // The shared `Project` type does not describe that field — the firewall
    // reads it through `ProjectSecurityResponse` — hence the assertion.
    useProject({
      ...defaultProject,
      id: 'securityplus-project',
      name: 'securityplus-project',
      accountId: 'team_dummy',
      security: { securityPlus: true },
    } as Project);
    useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
    useGetBypass([]);

    client.setArgv(
      'firewall',
      'status',
      '--project',
      'securityplus-project',
      '--json'
    );
    expect(await firewall(client)).toEqual(0);

    // Security+ is sold per project as well as team-wide, so a project that
    // carries it must not be told to buy it.
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.owasp).toEqual({ enabled: false, action: null });
  });

  it('reports the project selected by --project', async () => {
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

    client.setArgv('firewall', 'status', '--project', 'explicit-firewall');
    await expect(firewall(client)).resolves.toEqual(0);
    await expect(client.stderr).toOutput('Enabled');
  });

  it('reports a disabled firewall', async () => {
    useListFirewallConfigs(
      createConfig({ firewallEnabled: false, rules: [], ips: [] }),
      null
    );
    useGetBypass([]);

    client.setArgv('firewall', 'status');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Disabled');
    expect(await exitCodePromise).toEqual(0);
  });

  it('reports when no config exists', async () => {
    useListFirewallConfigs(null, null);
    useGetBypass([]);

    client.setArgv('firewall', 'status');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Not configured');
    expect(await exitCodePromise).toEqual(0);
  });

  it('reports pending draft changes', async () => {
    useListFirewallConfigs(
      createConfig({ firewallEnabled: true }),
      createConfig({
        id: 'config_draft',
        changes: [createChange('ip.insert', { value: { ip: '1.2.3.4' } })],
      })
    );
    useGetBypass([]);

    client.setArgv('firewall', 'status');
    const exitCodePromise = firewall(client);
    await expect(client.stderr).toOutput('Added IP block 1.2.3.4');
    expect(await exitCodePromise).toEqual(0);
  });

  describe('--json', () => {
    it('reports managed rulesets and the OWASP upgrade path', async () => {
      useListFirewallConfigs(
        createConfig({
          firewallEnabled: true,
          rules: [createRule(1), createRule(3)],
          managedRules: {
            bot_protection: { active: true, action: 'challenge' },
            ai_bots: { active: false },
          },
        }),
        null
      );
      useGetBypass([]);

      client.setArgv('firewall', 'status', '--json');
      expect(await firewall(client)).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.firewallEnabled).toBe(true);
      expect(payload.botProtection).toEqual({
        enabled: true,
        action: 'challenge',
      });
      expect(payload.aiBots).toEqual({ enabled: false, action: null });
      expect(payload.owasp).toEqual({
        enabled: false,
        action: null,
        requiresUpgrade: true,
        upgrade: 'security-plus',
      });
      expect(payload.rules).toEqual({ active: 1, inactive: 1, total: 2 });

      // The execution order is reported as data, in order, and runs through
      // to the response so an agent can see where a request ends up.
      expect(payload.requestFlow.map((s: { id: string }) => s.id)).toEqual([
        'system-rules',
        'attack-mode',
        'ip-blocking',
        'custom-rules',
        'bot-management',
        'managed-rulesets',
        'deployment-routing',
        'response-returned',
      ]);

      const botStage = payload.requestFlow.find(
        (s: { id: string }) => s.id === 'bot-management'
      );
      expect(botStage).toMatchObject({
        order: 5,
        group: 'managed-rulesets',
        label: 'Bot Management',
        state: 'active',
        action: 'challenge',
        skippableBy: ['system', 'custom'],
      });

      // No bypass of either kind is configured here, so nothing skips the
      // stage even though both kinds could. `skippableBy` is the capability;
      // `skippedBy` is what this project's configuration actually does.
      expect(botStage.skippedBy).toEqual([]);
      expect(payload.bypasses).toEqual({
        system: {
          state: 'inactive',
          count: 0,
          skips: ['system-rules', 'bot-management'],
        },
        custom: {
          state: 'inactive',
          count: 0,
          skips: ['bot-management', 'managed-rulesets'],
        },
      });

      // OWASP is absent from managedRules entirely, but it is still a member
      // of the stage and still plan-gated, so it must not silently vanish.
      const managed = payload.requestFlow.find(
        (s: { id: string }) => s.id === 'managed-rulesets'
      );
      expect(managed.state).toBe('inactive');
      expect(managed.rulesets).toEqual([
        {
          id: 'owasp',
          label: 'OWASP',
          state: 'unavailable',
          unavailable: { reason: 'plan', upgrade: 'security-plus' },
        },
        { id: 'ai-bots', label: 'AI Bots', state: 'inactive', action: null },
      ]);
    });

    it('resolves skippedBy from the bypasses that exist', async () => {
      useListFirewallConfigs(
        createConfig({
          firewallEnabled: true,
          rules: [
            createRule(1),
            {
              ...createRule(2),
              id: 'rule_bypass',
              active: true,
              action: { mitigate: { action: 'bypass' } },
            },
          ],
          managedRules: {
            bot_protection: { active: true, action: 'deny' },
            owasp: { active: true, action: 'deny' },
            ai_bots: { active: true, action: 'log' },
          },
        }),
        null
      );
      useGetBypass([createBypassRule(1)]);

      client.setArgv('firewall', 'status', '--json');
      expect(await firewall(client)).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());

      expect(payload.bypasses.system).toMatchObject({
        state: 'active',
        count: 1,
      });
      expect(payload.bypasses.custom).toMatchObject({
        state: 'active',
        count: 1,
      });

      const byId = (id: string) =>
        payload.requestFlow.find((s: { id: string }) => s.id === id);

      // A system bypass skips System Rules; a custom bypass rule does not.
      expect(byId('system-rules').skippedBy).toEqual(['system']);
      // Both kinds skip Bot Management.
      expect(byId('bot-management').skippedBy).toEqual(['system', 'custom']);
      // Only a custom bypass rule skips the remaining rulesets.
      expect(byId('managed-rulesets').skippedBy).toEqual(['custom']);
      // Nothing skips the custom rules themselves.
      expect(byId('custom-rules').skippedBy).toEqual([]);

      expect(byId('managed-rulesets').state).toBe('active');
    });

    it('reports the system bypass as unknown, not empty, when plan-gated', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypassError();

      client.setArgv('firewall', 'status', '--json');
      expect(await firewall(client)).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());

      // "Cannot read the bypass list" must not look like "no bypasses exist":
      // the count is absent rather than zero.
      expect(payload.bypasses.system.state).toBe('unknown');
      expect(payload.bypasses.system).not.toHaveProperty('count');

      // Nothing is known to skip anything, so no stage claims it is skipped.
      for (const stage of payload.requestFlow) {
        expect(stage.skippedBy).toEqual([]);
      }
    });
  });

  describe('when IP Bypass is unavailable on the plan', () => {
    it('still reports status instead of failing', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypassError();

      client.setArgv('firewall', 'status');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Requires Pro or Enterprise');
      expect(await exitCodePromise).toEqual(0);

      const output = client.stderr.getFullOutput();
      expect(output).toContain('Enabled');
      expect(output).not.toContain('IP Bypass is unavailable');
    });

    it('reports why bypass is null in JSON output', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypassError();

      client.setArgv('firewall', 'status', '--json');
      expect(await firewall(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.bypass).toBeNull();
      expect(json.bypassUnavailable).toEqual({
        reason: 'plan',
        message:
          'IP Bypass is unavailable for team acme. Pro and Enterprise plans include it.',
      });
    });

    it('still fails when the bypass request is denied by permissions', async () => {
      // The API checks permissions after the plan gate, so a 403 must not be
      // reported as a plan limitation.
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypassError(403, 'You do not have permission to read IP blocking.');

      client.setArgv('firewall', 'status');
      expect(await firewall(client)).toEqual(1);

      const output = client.stderr.getFullOutput();
      expect(output).not.toContain('Requires Pro or Enterprise');
      // Routed to the resolver rather than reported as a generic API failure.
      expect(output).toContain('Ask a team owner to grant access');
    });

    it('still fails on a 404, which no longer means plan gating', async () => {
      useListFirewallConfigs(createConfig({ firewallEnabled: true }), null);
      useGetBypassError(404, 'Project not found');

      client.setArgv('firewall', 'status');
      expect(await firewall(client)).toEqual(1);
      expect(client.stderr.getFullOutput()).not.toContain(
        'Requires Pro or Enterprise'
      );
    });
  });
});
