import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  detectShell,
  installedShells,
  refreshInstalledCompletions,
  writeCompletionFiles,
} from '../../../../src/util/completion/install';

describe('completion install helpers', () => {
  let tmp: string;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'vc-install-'));
    savedEnv = {
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      SHELL: process.env.SHELL,
    };
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

  describe('detectShell', () => {
    it('prefers an explicit valid shell', () => {
      expect(detectShell('zsh')).toBe('zsh');
    });
    it('rejects an unsupported explicit shell', () => {
      expect(detectShell('powershell')).toBeUndefined();
    });
    it('falls back to the $SHELL basename', () => {
      process.env.SHELL = '/usr/bin/bash';
      expect(detectShell()).toBe('bash');
    });
    it('returns undefined for an unknown $SHELL', () => {
      process.env.SHELL = '/usr/bin/tcsh';
      expect(detectShell()).toBeUndefined();
    });
  });

  describe('installedShells / refresh', () => {
    it('reports nothing installed on a clean sandbox', () => {
      expect(installedShells()).toEqual([]);
    });

    it('detects a shell once its file is written', async () => {
      await writeCompletionFiles('fish');
      expect(installedShells()).toEqual(['fish']);
    });

    it('refreshes only already-installed shells, never a first-time install', async () => {
      await writeCompletionFiles('fish');
      const fishFile = join(
        tmp,
        'config',
        'fish',
        'completions',
        'vercel.fish'
      );
      // Clobber the content so we can prove refresh rewrote it (the file must
      // still exist, else the shell no longer counts as installed).
      writeFileSync(fishFile, 'STALE', 'utf8');

      const refreshed = await refreshInstalledCompletions();

      expect(refreshed).toEqual(['fish']);
      expect(readFileSync(fishFile, 'utf8')).toContain('complete -c vercel');
      // bash was never installed, so refresh must not create it.
      expect(
        existsSync(
          join(tmp, 'data', 'bash-completion', 'completions', 'vercel')
        )
      ).toBe(false);
    });
  });
});
