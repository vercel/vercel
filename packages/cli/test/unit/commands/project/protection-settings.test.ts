import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
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
function setupProject(
  extra: Record<string, unknown> = {},
  onPatch?: (body: unknown) => void
) {
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
    ...extra,
  } as never);
}

describe('project protection settings subcommands', () => {
  afterEach(() => {
    client.stdin.isTTY = true;
    client.nonInteractive = false;
    vi.restoreAllMocks();
  });

  describe('options-allowlist', () => {
    it('shows the allowlist as JSON on get', async () => {
      setupProject({ optionsAllowlist: { paths: [{ value: '/api/.*' }] } });
      client.setArgv(
        'project',
        'protection',
        'options-allowlist',
        'get',
        'my-project',
        '--json'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput().trim());
      expect(out).toMatchObject({
        projectId: 'prj_123',
        optionsAllowlist: { paths: [{ value: '/api/.*' }] },
      });
    });

    it('replaces the allowlist via PATCH on set', async () => {
      let body: unknown;
      setupProject({}, b => {
        body = b;
      });
      client.setArgv(
        'project',
        'protection',
        'options-allowlist',
        'set',
        'my-project',
        '--path',
        '/api/.*',
        '--path',
        '/webhooks/stripe'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(body).toEqual({
        optionsAllowlist: {
          paths: [{ value: '/api/.*' }, { value: '/webhooks/stripe' }],
        },
      });
    });

    it('rejects paths not starting with "/" before any HTTP request', async () => {
      let patched = false;
      setupProject({}, () => {
        patched = true;
      });
      client.setArgv(
        'project',
        'protection',
        'options-allowlist',
        'set',
        'my-project',
        '--path',
        'api/foo'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      expect(patched).toBe(false);
      await expect(client.stderr).toOutput('must start with "/"');
    });

    it('rejects duplicate paths', async () => {
      setupProject();
      client.setArgv(
        'project',
        'protection',
        'options-allowlist',
        'set',
        'my-project',
        '--path',
        '/api',
        '--path',
        '/api'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Duplicate path');
    });

    it('requires at least one --path on set', async () => {
      setupProject();
      client.setArgv(
        'project',
        'protection',
        'options-allowlist',
        'set',
        'my-project'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('At least one');
    });

    it('rejects more than 5 paths before any HTTP request', async () => {
      let patched = false;
      setupProject({}, () => {
        patched = true;
      });
      const pathFlags = Array.from({ length: 6 }, (_, i) => [
        '--path',
        `/route-${i}`,
      ]).flat();
      client.setArgv(
        'project',
        'protection',
        'options-allowlist',
        'set',
        'my-project',
        ...pathFlags
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      expect(patched).toBe(false);
      await expect(client.stderr).toOutput(
        'Too many paths (6); the maximum is 5'
      );
    });

    it('clears the allowlist (null) on disable --yes', async () => {
      let body: unknown;
      setupProject({}, b => {
        body = b;
      });
      client.setArgv(
        'project',
        'protection',
        'options-allowlist',
        'disable',
        'my-project',
        '--yes'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(body).toEqual({ optionsAllowlist: null });
    });

    it('redacts --path values in telemetry', async () => {
      setupProject({}, () => {});
      client.setArgv(
        'project',
        'protection',
        'options-allowlist',
        'set',
        'my-project',
        '--path',
        '/internal/secret-route'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      const events = client.telemetryEventStore.readonlyEvents;
      const pathEvent = events.find(e => e.key === 'option:path');
      expect(pathEvent?.value).toBe('[REDACTED]');
      expect(events.every(e => !String(e.value).includes('secret-route'))).toBe(
        true
      );
    });
  });

  describe('trusted-sources', () => {
    it('shows the config on get', async () => {
      setupProject({
        trustedSources: { projects: { prj_abc: { label: 'peer' } } },
      });
      client.setArgv(
        'project',
        'protection',
        'trusted-sources',
        'get',
        'my-project',
        '--json'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput().trim());
      expect(out).toMatchObject({
        projectId: 'prj_123',
        trustedSources: { projects: { prj_abc: { label: 'peer' } } },
      });
    });

    it('replaces the config from --file on set', async () => {
      let body: unknown;
      setupProject({}, b => {
        body = b;
      });
      const dir = mkdtempSync(join(tmpdir(), 'vc-cli-ts-'));
      const filePath = join(dir, 'trusted-sources.json');
      const config = {
        projects: {
          prj_abc: {
            label: 'monorepo peer',
            customAllow: [
              { from: { slugs: ['preview'] }, to: { slugs: ['preview'] } },
            ],
          },
        },
      };
      writeFileSync(filePath, JSON.stringify(config));
      try {
        client.setArgv(
          'project',
          'protection',
          'trusted-sources',
          'set',
          'my-project',
          '--file',
          filePath
        );
        const exitCode = await project(client);
        expect(exitCode).toBe(0);
        expect(body).toEqual({ trustedSources: config });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('rejects a config with unknown keys before any HTTP request', async () => {
      let patched = false;
      setupProject({}, () => {
        patched = true;
      });
      const dir = mkdtempSync(join(tmpdir(), 'vc-cli-ts-bad-'));
      const filePath = join(dir, 'bad.json');
      writeFileSync(
        filePath,
        JSON.stringify({ projects: {}, somethingElse: 1 })
      );
      try {
        client.setArgv(
          'project',
          'protection',
          'trusted-sources',
          'set',
          'my-project',
          '--file',
          filePath
        );
        const exitCode = await project(client);
        expect(exitCode).toBe(1);
        expect(patched).toBe(false);
        await expect(client.stderr).toOutput('unknown key');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it.each([
      ['malformed JSON', '{ not json', 'expected a JSON object'],
      ['an empty object', '{}', 'at least one of'],
      ['a JSON array', '[]', 'expected a JSON object'],
    ])('rejects %s in --file before any HTTP request', async (_name, contents, expected) => {
      let patched = false;
      setupProject({}, () => {
        patched = true;
      });
      const dir = mkdtempSync(join(tmpdir(), 'vc-cli-ts-invalid-'));
      const filePath = join(dir, 'config.json');
      writeFileSync(filePath, contents);
      try {
        client.setArgv(
          'project',
          'protection',
          'trusted-sources',
          'set',
          'my-project',
          '--file',
          filePath
        );
        const exitCode = await project(client);
        expect(exitCode).toBe(1);
        expect(patched).toBe(false);
        await expect(client.stderr).toOutput(expected);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('requires --file on set', async () => {
      setupProject();
      client.setArgv(
        'project',
        'protection',
        'trusted-sources',
        'set',
        'my-project'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('--file');
    });

    it('clears the config (null) on disable --yes', async () => {
      let body: unknown;
      setupProject({}, b => {
        body = b;
      });
      client.setArgv(
        'project',
        'protection',
        'trusted-sources',
        'disable',
        'my-project',
        '--yes'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(body).toEqual({ trustedSources: null });
    });
  });

  describe('shared disable confirmation behavior', () => {
    it('requires --yes in non-interactive mode (confirmation_required)', async () => {
      let patched = false;
      setupProject({}, () => {
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
        'options-allowlist',
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
      setupProject({}, () => {
        patched = true;
      });
      client.input.confirm = vi.fn().mockResolvedValue(false);
      client.setArgv(
        'project',
        'protection',
        'trusted-sources',
        'disable',
        'my-project'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(patched).toBe(false);
      await expect(client.stderr).toOutput('Aborted');
    });
  });

  it('rejects an unknown action', async () => {
    setupProject();
    client.setArgv(
      'project',
      'protection',
      'options-allowlist',
      'frobnicate',
      'my-project'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('Invalid arguments');
  });

  describe('--help', () => {
    it.each([
      'trusted-sources',
      'options-allowlist',
    ])('prints help and tracks telemetry for %s', async slug => {
      client.setArgv('project', 'protection', slug, '--help');
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `project:protection ${slug}`,
        },
      ]);
    });
  });
});
