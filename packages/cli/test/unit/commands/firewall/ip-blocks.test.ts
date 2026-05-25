import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useListFirewallConfigs,
  useActivateConfig,
  usePatchDraft,
  capturedRequests,
  createConfig,
  createIpRule,
  createChange,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall ip-blocks', () => {
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

  describe('list', () => {
    it('should show no rules when empty', async () => {
      useListFirewallConfigs(createConfig(), null);
      client.setArgv('firewall', 'ip-blocks', 'list');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('No IP blocking rules configured');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should list active rules with live status', async () => {
      const active = createConfig({
        ips: [createIpRule(1), createIpRule(2)],
      });
      useListFirewallConfigs(active, null);
      client.setArgv('firewall', 'ip-blocks', 'list');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Showing live configuration');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should annotate draft additions with +', async () => {
      const active = createConfig({
        ips: [createIpRule(1)],
      });
      const draft = createConfig({
        id: 'draft',
        ips: [createIpRule(1), createIpRule(2)],
        changes: [
          createChange('ip.insert', {
            id: 'ip_002',
            value: { ip: '10.0.0.2' },
          }),
        ],
      });
      useListFirewallConfigs(active, draft);
      client.setArgv('firewall', 'ip-blocks', 'list');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('unpublished IP block change');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should output JSON with --json flag', async () => {
      const active = createConfig({
        ips: [createIpRule(1)],
      });
      useListFirewallConfigs(active, null);
      client.setArgv('firewall', 'ip-blocks', 'list', '--json');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);
    });

    it('tracks help telemetry', async () => {
      client.setArgv('firewall', 'ip-blocks', 'list', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
    });
  });

  describe('block', () => {
    it('should stage an IP block with --yes', async () => {
      // No existing draft
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv('firewall', 'ip-blocks', 'block', '10.0.0.1', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        'IP block for 10.0.0.1 on all hosts staged'
      );
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.patchDraft?.action).toBe('ip.insert');
      expect(capturedRequests.patchDraft?.value).toMatchObject({
        ip: '10.0.0.1',
        hostname: '*',
        action: 'deny',
      });
    });

    it('should stage a CIDR block', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv('firewall', 'ip-blocks', 'block', '10.0.0.0/24', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        'IP block for 10.0.0.0/24 on all hosts staged'
      );
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.patchDraft?.action).toBe('ip.insert');
      expect(capturedRequests.patchDraft?.value).toMatchObject({
        ip: '10.0.0.0/24',
      });
    });

    it('should accept --hostname flag', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'ip-blocks',
        'block',
        '10.0.0.1',
        '--hostname',
        'example.com',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('staged');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.patchDraft?.value).toMatchObject({
        ip: '10.0.0.1',
        hostname: 'example.com',
      });
    });

    it('should reject invalid IP', async () => {
      client.setArgv('firewall', 'ip-blocks', 'block', 'not-an-ip', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('valid IP address or CIDR');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should reject 0.0.0.0/0', async () => {
      client.setArgv('firewall', 'ip-blocks', 'block', '0.0.0.0/0', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('net mask less than /16');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should reject too-wide CIDR', async () => {
      client.setArgv('firewall', 'ip-blocks', 'block', '10.0.0.0/8', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('net mask less than /16');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should warn about other draft changes', async () => {
      // Existing draft with changes
      const draft = createConfig({
        id: 'draft',
        changes: [
          createChange('rules.insert', {
            value: { name: 'Existing rule' },
          }),
        ],
      });
      useListFirewallConfigs(createConfig(), draft);
      usePatchDraft();

      client.setArgv('firewall', 'ip-blocks', 'block', '10.0.0.1', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('other draft changes');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should error when ip is missing', async () => {
      client.setArgv('firewall', 'ip-blocks', 'block', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Missing required argument');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should include notes in request body', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'ip-blocks',
        'block',
        '10.0.0.1',
        '--notes',
        'Suspicious activity',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('staged');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.patchDraft?.value).toMatchObject({
        ip: '10.0.0.1',
        notes: 'Suspicious activity',
      });
    });

    it('should reject invalid hostname', async () => {
      client.setArgv(
        'firewall',
        'ip-blocks',
        'block',
        '10.0.0.1',
        '--hostname',
        'not a valid host!',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('valid domain');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should reject note over 500 characters', async () => {
      const longNote = 'a'.repeat(501);
      client.setArgv(
        'firewall',
        'ip-blocks',
        'block',
        '10.0.0.1',
        '--notes',
        longNote,
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('500 characters or less');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should block an IPv6 address', async () => {
      useListFirewallConfigs(createConfig(), null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv('firewall', 'ip-blocks', 'block', '2001:db8::1', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('staged');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.patchDraft?.value).toMatchObject({
        ip: '2001:db8::1',
      });
    });
  });

  describe('unblock', () => {
    it('should stage IP block removal by IP with --yes', async () => {
      const active = createConfig({
        ips: [createIpRule(1)],
      });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv('firewall', 'ip-blocks', 'unblock', '10.0.0.1', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput(
        'IP block removal for 10.0.0.1 staged'
      );
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.patchDraft?.action).toBe('ip.remove');
      expect(capturedRequests.patchDraft?.id).toBe('ip_001');
    });

    it('should stage IP block removal by ID with --yes', async () => {
      const active = createConfig({
        ips: [createIpRule(1)],
      });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv('firewall', 'ip-blocks', 'unblock', 'ip_001', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('staged');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.patchDraft?.action).toBe('ip.remove');
      expect(capturedRequests.patchDraft?.id).toBe('ip_001');
    });

    it('should error when IP not found', async () => {
      useListFirewallConfigs(createConfig({ ips: [] }), null);
      client.setArgv(
        'firewall',
        'ip-blocks',
        'unblock',
        '99.99.99.99',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('No IP block found');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should error when identifier is missing', async () => {
      client.setArgv('firewall', 'ip-blocks', 'unblock', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Missing required argument');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should disambiguate with --hostname when same IP on multiple hosts', async () => {
      const active = createConfig({
        ips: [
          {
            id: 'ip_all',
            ip: '10.0.0.1',
            hostname: '*',
            action: 'deny',
            notes: 'All hosts',
          },
          {
            id: 'ip_example',
            ip: '10.0.0.1',
            hostname: 'example.com',
            action: 'deny',
            notes: 'Example only',
          },
        ],
      });
      useListFirewallConfigs(active, null);
      usePatchDraft();
      useActivateConfig();

      client.setArgv(
        'firewall',
        'ip-blocks',
        'unblock',
        '10.0.0.1',
        '--hostname',
        'example.com',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('staged');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.patchDraft?.action).toBe('ip.remove');
      expect(capturedRequests.patchDraft?.id).toBe('ip_example');
    });

    it('should error when same IP on multiple hosts without --hostname', async () => {
      const active = createConfig({
        ips: [
          {
            id: 'ip_all',
            ip: '10.0.0.1',
            hostname: '*',
            action: 'deny',
          },
          {
            id: 'ip_example',
            ip: '10.0.0.1',
            hostname: 'example.com',
            action: 'deny',
          },
        ],
      });
      useListFirewallConfigs(active, null);

      client.setArgv('firewall', 'ip-blocks', 'unblock', '10.0.0.1', '--yes');
      (client.stdin as any).isTTY = false;
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Multiple IP blocks match');
      expect(await exitCodePromise).toEqual(1);
    });
  });
});
