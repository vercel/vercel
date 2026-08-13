import { afterEach, describe, expect, it, vi } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';

/**
 * Registers user/team/project mocks. When `onPatch` is provided, a PATCH
 * handler is registered BEFORE `useProject` so it wins route matching over
 * the generic `useProject` PATCH mock (first registered route wins).
 */
function setupProject(trustedIps?: unknown, onPatch?: (body: unknown) => void) {
  useUser();
  useTeams('team_dummy');
  if (onPatch) {
    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      onPatch(req.body);
      res.json({ id: 'prj_123' });
    });
  }
  useProject({
    ...defaultProject,
    id: 'prj_123',
    name: 'my-project',
    ...(trustedIps !== undefined ? { trustedIps } : {}),
  } as never);
}

describe('project protection trusted-ips', () => {
  afterEach(() => {
    client.stdin.isTTY = true;
    client.nonInteractive = false;
    vi.restoreAllMocks();
  });

  describe('get', () => {
    it('reports when Trusted IPs are not configured', async () => {
      setupProject(null);
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'get',
        'my-project'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput('Trusted IPs are not configured');
    });

    it('shows the allowlist as JSON', async () => {
      setupProject({
        deploymentType: 'all',
        addresses: [{ value: '203.0.113.4', note: 'office' }],
        protectionMode: 'additional',
      });
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'get',
        'my-project',
        '--json'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput().trim());
      expect(out).toMatchObject({
        projectId: 'prj_123',
        name: 'my-project',
        trustedIps: {
          deploymentType: 'all',
          protectionMode: 'additional',
          addresses: [{ value: '203.0.113.4', note: 'office' }],
        },
      });
    });
  });

  describe('set', () => {
    it('replaces trustedIps via PATCH and returns JSON', async () => {
      let body: unknown;
      setupProject(null, b => {
        body = b;
      });

      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'set',
        'my-project',
        '--ip',
        '203.0.113.4',
        '--ip',
        '198.51.100.0/24=corp net',
        '--deployment-type',
        'all',
        '--mode',
        'additional',
        '--json'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(body).toEqual({
        trustedIps: {
          deploymentType: 'all',
          protectionMode: 'additional',
          addresses: [
            { value: '203.0.113.4' },
            { value: '198.51.100.0/24', note: 'corp net' },
          ],
        },
      });
    });

    it('requires --deployment-type', async () => {
      let patched = false;
      setupProject(null, () => {
        patched = true;
      });
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'set',
        '--ip',
        '203.0.113.4',
        '--mode',
        'additional'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      expect(patched).toBe(false);
      await expect(client.stderr).toOutput('--deployment-type');
    });

    it('rejects an invalid --mode', async () => {
      setupProject(null);
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'set',
        '--ip',
        '203.0.113.4',
        '--deployment-type',
        'all',
        '--mode',
        'bogus'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('--mode');
    });

    it('requires at least one --ip', async () => {
      setupProject(null);
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'set',
        '--deployment-type',
        'all',
        '--mode',
        'additional'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('At least one');
    });

    it('rejects an invalid IP before any HTTP request', async () => {
      let patched = false;
      setupProject(null, () => {
        patched = true;
      });
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'set',
        '--ip',
        '999.1.1.1',
        '--deployment-type',
        'all',
        '--mode',
        'additional'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      expect(patched).toBe(false);
      await expect(client.stderr).toOutput('Invalid --ip');
    });

    it('rejects an invalid CIDR prefix before any HTTP request', async () => {
      setupProject(null);
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'set',
        '--ip',
        '10.0.0.0/33',
        '--deployment-type',
        'all',
        '--mode',
        'additional'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid --ip');
    });

    it.each([
      ['leading-zero octet', '01.2.3.4'],
      ['too few octets', '1.2.3'],
      ['negative CIDR prefix', '10.0.0.0/-1'],
    ])('rejects %s before any HTTP request', async (_name, ip) => {
      let patched = false;
      setupProject(null, () => {
        patched = true;
      });
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'set',
        '--ip',
        ip,
        '--deployment-type',
        'all',
        '--mode',
        'additional'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      expect(patched).toBe(false);
      await expect(client.stderr).toOutput('Invalid --ip');
    });

    it('rejects IPv6 addresses', async () => {
      setupProject(null);
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'set',
        '--ip',
        '2001:db8::1',
        '--deployment-type',
        'all',
        '--mode',
        'additional'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('IPv6');
    });

    it('rejects a note longer than 20 characters', async () => {
      setupProject(null);
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'set',
        '--ip',
        '203.0.113.4=this note is way too long to be accepted',
        '--deployment-type',
        'all',
        '--mode',
        'additional'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('at most 20');
    });

    it('rejects duplicate IPs', async () => {
      setupProject(null);
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'set',
        '--ip',
        '203.0.113.4',
        '--ip',
        '203.0.113.4',
        '--deployment-type',
        'all',
        '--mode',
        'additional'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Duplicate');
    });

    it('redacts IPs but records enums verbatim in telemetry', async () => {
      setupProject(null, () => {});
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'set',
        'my-project',
        '--ip',
        '203.0.113.4',
        '--deployment-type',
        'production',
        '--mode',
        'exclusive'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);

      const events = client.telemetryEventStore.readonlyEvents;
      const ipEvent = events.find(e => e.key === 'option:ip');
      expect(ipEvent?.value).toBe('[REDACTED]');
      expect(events).toContainEqual(
        expect.objectContaining({
          key: 'option:deployment-type',
          value: 'production',
        })
      );
      expect(events).toContainEqual(
        expect.objectContaining({ key: 'option:mode', value: 'exclusive' })
      );
      // The raw IP must never appear in any telemetry value.
      expect(events.every(e => !String(e.value).includes('203.0.113.4'))).toBe(
        true
      );
    });
  });

  describe('disable', () => {
    it('clears trustedIps with --yes', async () => {
      let body: unknown;
      setupProject(
        {
          deploymentType: 'all',
          addresses: [{ value: '203.0.113.4' }],
          protectionMode: 'additional',
        },
        b => {
          body = b;
        }
      );
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'disable',
        'my-project',
        '--yes'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(body).toEqual({ trustedIps: null });
      await expect(client.stderr).toOutput('Trusted IPs cleared');
    });

    it('requires --yes in non-interactive mode (confirmation_required)', async () => {
      let patched = false;
      setupProject(null, () => {
        patched = true;
      });
      vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => {
        throw new Error('exit');
      }) as () => never);
      client.nonInteractive = true;
      client.input.confirm = vi.fn();
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'disable',
        'my-project'
      );
      await expect(project(client)).rejects.toThrow('exit');
      expect(patched).toBe(false);
      expect(client.input.confirm).not.toHaveBeenCalled();
      const out = JSON.parse(client.stdout.getFullOutput().trim());
      expect(out.reason).toBe('confirmation_required');
    });

    it('aborts without mutating when the prompt is declined', async () => {
      let patched = false;
      setupProject(null, () => {
        patched = true;
      });
      client.input.confirm = vi.fn().mockResolvedValue(false);
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'disable',
        'my-project'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(patched).toBe(false);
      await expect(client.stderr).toOutput('Aborted');
    });

    it('clears trustedIps when the prompt is confirmed', async () => {
      let body: unknown;
      setupProject(null, b => {
        body = b;
      });
      client.input.confirm = vi.fn().mockResolvedValue(true);
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'disable',
        'my-project'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(body).toEqual({ trustedIps: null });
    });
  });

  it('rejects an unknown action', async () => {
    setupProject(null);
    client.setArgv('project', 'protection', 'trusted-ips', 'frobnicate');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('Invalid action');
  });

  it.each([
    ['get', ['--ip', '203.0.113.4'] as string[]],
    ['get', ['--deployment-type', 'all'] as string[]],
    ['disable', ['--mode', 'additional', '--yes'] as string[]],
  ])('rejects set-only flags with %s (exit 2, no mutation)', async (action, flags) => {
    let patched = false;
    setupProject(null, () => {
      patched = true;
    });
    client.setArgv(
      'project',
      'protection',
      'trusted-ips',
      action,
      'my-project',
      ...flags
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    expect(patched).toBe(false);
    await expect(client.stderr).toOutput(
      'can only be used with `project protection trusted-ips set`'
    );
  });

  describe('--help', () => {
    it('prints help and tracks telemetry', async () => {
      client.setArgv('project', 'protection', 'trusted-ips', '--help');
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'project:protection trusted-ips',
        },
      ]);
    });
  });
});
