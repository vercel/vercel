import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { client } from '../../../mocks/client';
import completion from '../../../../src/commands/completion';

// The dynamic source hits the network + an on-disk cache; stub it so the
// driver's wiring is tested deterministically.
vi.mock('../../../../src/util/completion/sources', () => ({
  resolveCompletionSource: vi.fn(async () => ['acme', 'jsvana']),
}));

function stdoutLines(): string[] {
  return client.stdout.getFullOutput().trim().split('\n').filter(Boolean);
}

describe('completion', () => {
  describe('script generation', () => {
    it('prints a bash script and registers both binaries', async () => {
      client.setArgv('completion', 'bash');
      const code = await completion(client);
      expect(code).toEqual(0);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('_vercel_completion()');
      expect(out).toContain('complete -o default -F _vercel_completion vercel');
      expect(out).toContain('complete -o default -F _vercel_completion vc');
    });

    it('prints a zsh script', async () => {
      client.setArgv('completion', 'zsh');
      expect(await completion(client)).toEqual(0);
      expect(client.stdout.getFullOutput()).toContain('#compdef vercel vc');
    });

    it('prints a fish script', async () => {
      client.setArgv('completion', 'fish');
      expect(await completion(client)).toEqual(0);
      expect(client.stdout.getFullOutput()).toContain('complete -c vercel');
    });

    it('tracks the shell argument', async () => {
      client.setArgv('completion', 'zsh');
      await completion(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:shell', value: 'zsh' },
      ]);
    });

    it('errors on an unsupported shell', async () => {
      client.setArgv('completion', 'powershell');
      expect(await completion(client)).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('Unsupported shell');
    });

    it('errors when the shell argument is missing', async () => {
      client.setArgv('completion');
      expect(await completion(client)).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('Missing shell');
    });
  });

  describe('__complete driver', () => {
    it('lists top-level commands', async () => {
      client.setArgv('completion', '__complete', '--', '');
      expect(await completion(client)).toEqual(0);
      const lines = stdoutLines();
      expect(lines).toContain('deploy');
      expect(lines).toContain('teams');
      expect(lines).toContain('completion');
    });

    it('lists teams subcommands', async () => {
      client.setArgv('completion', '__complete', '--', 'teams', '');
      await completion(client);
      expect(stdoutLines()).toContain('switch');
    });

    it('completes flags', async () => {
      client.setArgv('completion', '__complete', '--', 'deploy', '--sc');
      await completion(client);
      expect(stdoutLines()).toContain('--scope');
    });

    it('completes the shell argument values and the install subcommand', async () => {
      client.setArgv('completion', '__complete', '--', 'completion', '');
      await completion(client);
      expect(stdoutLines()).toEqual(['bash', 'fish', 'install', 'zsh']);
    });

    it('completes shells after `completion install`', async () => {
      client.setArgv(
        'completion',
        '__complete',
        '--',
        'completion',
        'install',
        ''
      );
      await completion(client);
      expect(stdoutLines()).toEqual(['bash', 'fish', 'zsh']);
    });

    it('completes team slugs for `teams switch` via the source', async () => {
      client.setArgv('completion', '__complete', '--', 'teams', 'switch', '');
      await completion(client);
      expect(stdoutLines()).toEqual(['acme', 'jsvana']);
    });

    it('emits nothing (and does not throw) for an unknown command', async () => {
      client.setArgv('completion', '__complete', '--', 'notacommand', '');
      expect(await completion(client)).toEqual(0);
      expect(client.stdout.getFullOutput()).toEqual('');
    });
  });

  describe('install', () => {
    let tmp: string;
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'vc-completion-'));
      savedEnv = {
        XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
        XDG_DATA_HOME: process.env.XDG_DATA_HOME,
        SHELL: process.env.SHELL,
      };
      // Sandbox all install destinations under the temp dir.
      process.env.XDG_CONFIG_HOME = join(tmp, 'config');
      process.env.XDG_DATA_HOME = join(tmp, 'data');
    });

    afterEach(() => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });

    it('writes the fish completion file for an explicit shell', async () => {
      client.setArgv('completion', 'install', 'fish');
      expect(await completion(client)).toEqual(0);
      const file = join(tmp, 'config', 'fish', 'completions', 'vercel.fish');
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, 'utf8')).toContain('complete -c vercel');
    });

    it('detects the shell from $SHELL when no argument is given', async () => {
      process.env.SHELL = '/opt/homebrew/bin/fish';
      client.setArgv('completion', 'install');
      expect(await completion(client)).toEqual(0);
      expect(
        existsSync(join(tmp, 'config', 'fish', 'completions', 'vercel.fish'))
      ).toBe(true);
    });

    it('writes both bash files and prints an fpath hint for zsh', async () => {
      client.setArgv('completion', 'install', 'bash');
      expect(await completion(client)).toEqual(0);
      const base = join(tmp, 'data', 'bash-completion', 'completions');
      expect(existsSync(join(base, 'vercel'))).toBe(true);
      expect(existsSync(join(base, 'vc'))).toBe(true);

      client.setArgv('completion', 'install', 'zsh');
      expect(await completion(client)).toEqual(0);
      expect(
        existsSync(join(tmp, 'data', 'zsh', 'site-functions', '_vercel'))
      ).toBe(true);
      expect(client.stderr.getFullOutput()).toContain('fpath=');
    });

    it('errors on an unsupported shell', async () => {
      client.setArgv('completion', 'install', 'powershell');
      expect(await completion(client)).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('Unsupported shell');
    });

    it('errors when the shell cannot be detected', async () => {
      delete process.env.SHELL;
      client.setArgv('completion', 'install');
      expect(await completion(client)).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('Could not detect');
    });
  });
});
