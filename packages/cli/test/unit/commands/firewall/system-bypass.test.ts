import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import {
  useGetBypass,
  useAddBypass,
  useRemoveBypass,
  capturedRequests,
  createBypassRule,
} from '../../../mocks/firewall';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('firewall system-bypass', () => {
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
    it('should show no bypass rules when empty', async () => {
      useGetBypass([]);
      client.setArgv('firewall', 'system-bypass', 'list');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('No system bypass rules configured');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should list bypass rules', async () => {
      useGetBypass([createBypassRule(1), createBypassRule(2)]);
      client.setArgv('firewall', 'system-bypass', 'list');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('192.168.1.2');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should output JSON with --json flag', async () => {
      useGetBypass([createBypassRule(1)]);
      client.setArgv('firewall', 'system-bypass', 'list', '--json');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(0);
    });

    it('tracks help telemetry', async () => {
      client.setArgv('firewall', 'system-bypass', 'list', '--help');
      const exitCode = await firewall(client);
      expect(exitCode).toEqual(2);
    });
  });

  describe('add', () => {
    it('should add a bypass rule with --yes', async () => {
      useAddBypass();
      client.setArgv('firewall', 'system-bypass', 'add', '10.0.0.1', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Added system bypass');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.addBypass).toBeDefined();
      expect(capturedRequests.addBypass?.sourceIp).toBe('10.0.0.1');
    });

    it('should add a bypass rule with --domain', async () => {
      useAddBypass();
      client.setArgv(
        'firewall',
        'system-bypass',
        'add',
        '10.0.0.1',
        '--domain',
        'example.com',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Added system bypass');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.addBypass?.sourceIp).toBe('10.0.0.1');
      expect(capturedRequests.addBypass?.domain).toBe('example.com');
    });

    it('should error when ip is missing', async () => {
      client.setArgv('firewall', 'system-bypass', 'add', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Missing required argument');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should reject invalid IP address', async () => {
      client.setArgv('firewall', 'system-bypass', 'add', 'not-an-ip', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('valid IP address or CIDR');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should reject CIDR with mask less than /16', async () => {
      client.setArgv('firewall', 'system-bypass', 'add', '10.0.0.0/8', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('net mask less than /16');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should accept valid CIDR', async () => {
      useAddBypass();
      client.setArgv(
        'firewall',
        'system-bypass',
        'add',
        '10.0.0.0/24',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Added system bypass');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.addBypass?.sourceIp).toBe('10.0.0.0/24');
    });

    it('should reject invalid domain', async () => {
      client.setArgv(
        'firewall',
        'system-bypass',
        'add',
        '10.0.0.1',
        '--domain',
        'not a valid domain!',
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
        'system-bypass',
        'add',
        '10.0.0.1',
        '--notes',
        longNote,
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('500 characters or less');
      expect(await exitCodePromise).toEqual(1);
    });
  });

  describe('remove', () => {
    it('should remove a bypass rule with --yes', async () => {
      useRemoveBypass();
      client.setArgv(
        'firewall',
        'system-bypass',
        'remove',
        '10.0.0.1',
        '--yes'
      );
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Removed system bypass');
      expect(await exitCodePromise).toEqual(0);
      expect(capturedRequests.removeBypass).toBeDefined();
    });

    it('should error when ip is missing', async () => {
      client.setArgv('firewall', 'system-bypass', 'remove', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('Missing required argument');
      expect(await exitCodePromise).toEqual(1);
    });

    it('should reject invalid IP on remove', async () => {
      client.setArgv('firewall', 'system-bypass', 'remove', 'garbage', '--yes');
      const exitCodePromise = firewall(client);
      await expect(client.stderr).toOutput('valid IP address or CIDR');
      expect(await exitCodePromise).toEqual(1);
    });
  });
});
