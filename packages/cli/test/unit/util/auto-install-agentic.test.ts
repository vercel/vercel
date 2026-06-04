import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KNOWN_AGENTS } from '@vercel/detect-agent';
import {
  autoInstallVercelPlugin,
  buildClaudePromptCopy,
  buildClaudePluginMigrationPlan,
  buildClaudePluginStatus,
  comparePluginVersions,
  getPluginTargetForAgent,
  projectHasUsedClaudeCode,
} from '../../../src/util/agent/auto-install-agentic';
import { client } from '../../mocks/client';

describe('comparePluginVersions', () => {
  it('compares dot-separated versions', () => {
    expect(comparePluginVersions('0.32.7', '0.32.7')).toBe(0);
    expect(comparePluginVersions('0.32.8', '0.32.7')).toBe(1);
    expect(comparePluginVersions('0.32.7', '0.32.8')).toBe(-1);
    expect(comparePluginVersions('1.0.0', '0.99.9')).toBe(1);
  });
});

describe('getPluginTargetForAgent', () => {
  it('maps Claude Code agents to the Claude plugin target', () => {
    expect(getPluginTargetForAgent(KNOWN_AGENTS.CLAUDE)).toBe('claude-code');
    expect(getPluginTargetForAgent(KNOWN_AGENTS.COWORK)).toBe('claude-code');
    expect(getPluginTargetForAgent('claude-code/2.1.126/agent')).toBe(
      'claude-code'
    );
  });

  it('does not map Codex to a Claude plugin target', () => {
    expect(getPluginTargetForAgent(KNOWN_AGENTS.CODEX)).toBeUndefined();
  });
});

describe('buildClaudePluginStatus', () => {
  it('detects a legacy-only install', () => {
    const status = buildClaudePluginStatus(
      [{ id: 'vercel-plugin@vercel', version: '0.22.0' }],
      '0.32.7'
    );

    expect(status.state).toBe('legacy-only');
    expect(status.legacy?.version).toBe('0.22.0');
    expect(status.official).toBeUndefined();
    expect(status.latestVersion).toBe('0.32.7');
  });

  it('detects an official-only install', () => {
    const status = buildClaudePluginStatus([
      { id: 'vercel@claude-plugins-official', version: '0.32.7' },
    ]);

    expect(status.state).toBe('official-only');
    expect(status.legacy).toBeUndefined();
    expect(status.official?.version).toBe('0.32.7');
  });

  it('detects both installs', () => {
    const status = buildClaudePluginStatus([
      { id: 'vercel-plugin@vercel', version: '0.32.6' },
      { id: 'vercel@claude-plugins-official', version: '0.32.7' },
    ]);

    expect(status.state).toBe('both');
    expect(status.legacy?.version).toBe('0.32.6');
    expect(status.official?.version).toBe('0.32.7');
  });

  it('preserves stale legacy install metadata', () => {
    const status = buildClaudePluginStatus(
      [
        {
          id: 'vercel-plugin@vercel',
          version: '0.22.0',
          installPath: '/missing/vercel-plugin',
          stale: true,
        },
      ],
      '0.32.7'
    );

    expect(status.state).toBe('legacy-only');
    expect(status.legacy?.stale).toBe(true);
  });
});

describe('buildClaudePluginMigrationPlan', () => {
  it('installs the official plugin for a missing install', () => {
    const plan = buildClaudePluginMigrationPlan({
      state: 'none',
      latestVersion: '0.32.7',
    });

    expect(plan).toEqual({
      installOfficial: true,
      updateOfficial: false,
      removeLegacy: false,
      removeLegacyMarketplace: false,
    });
  });

  it('migrates a legacy-only install', () => {
    const plan = buildClaudePluginMigrationPlan({
      state: 'legacy-only',
      legacy: { id: 'vercel-plugin@vercel', version: '0.22.0' },
      latestVersion: '0.32.7',
    });

    expect(plan).toEqual({
      installOfficial: true,
      updateOfficial: false,
      removeLegacy: true,
      removeLegacyMarketplace: true,
    });
  });

  it('updates an outdated official install', () => {
    const plan = buildClaudePluginMigrationPlan({
      state: 'official-only',
      official: { id: 'vercel@claude-plugins-official', version: '0.32.6' },
      latestVersion: '0.32.7',
    });

    expect(plan).toEqual({
      installOfficial: false,
      updateOfficial: true,
      removeLegacy: false,
      removeLegacyMarketplace: false,
    });
  });

  it('removes the legacy install when both are present', () => {
    const plan = buildClaudePluginMigrationPlan({
      state: 'both',
      legacy: { id: 'vercel-plugin@vercel', version: '0.32.6' },
      official: { id: 'vercel@claude-plugins-official', version: '0.32.7' },
      latestVersion: '0.32.7',
    });

    expect(plan).toEqual({
      installOfficial: false,
      updateOfficial: false,
      removeLegacy: true,
      removeLegacyMarketplace: true,
    });
  });
});

describe('buildClaudePromptCopy', () => {
  it('uses install copy for a missing Claude install', () => {
    const copy = buildClaudePromptCopy(
      { state: 'none', latestVersion: '0.32.7' },
      {
        installOfficial: true,
        updateOfficial: false,
        removeLegacy: false,
        removeLegacyMarketplace: false,
      }
    );

    expect(copy.message).toBe('');
    expect(copy.confirm).toContain(
      'Working with Vercel is easier with the Vercel Plugin for Claude Code'
    );
    expect(copy.confirm).toContain('Would you like to install it?');
  });

  it('uses migration copy for the old Claude marketplace install', () => {
    const copy = buildClaudePromptCopy(
      {
        state: 'legacy-only',
        legacy: { id: 'vercel-plugin@vercel', version: '0.22.0' },
        latestVersion: '0.32.7',
      },
      {
        installOfficial: true,
        updateOfficial: false,
        removeLegacy: true,
        removeLegacyMarketplace: true,
      }
    );

    expect(copy.message).toBe('');
    expect(copy.confirm).toContain(
      'Working with Vercel is easier with the latest Vercel Plugin for Claude Code'
    );
    expect(copy.confirm).toContain('Would you like to update it?');
  });

  it('uses cleanup copy when both Claude installs exist', () => {
    const copy = buildClaudePromptCopy(
      {
        state: 'both',
        legacy: { id: 'vercel-plugin@vercel', version: '0.32.6' },
        official: { id: 'vercel@claude-plugins-official', version: '0.32.7' },
        latestVersion: '0.32.7',
      },
      {
        installOfficial: false,
        updateOfficial: false,
        removeLegacy: true,
        removeLegacyMarketplace: true,
      }
    );

    expect(copy.message).toBe('');
    expect(copy.confirm).toContain(
      'Working with Vercel is easier with the latest Vercel Plugin for Claude Code'
    );
    expect(copy.confirm).toContain('Would you like to update it?');
  });

  it('uses update copy for an outdated official Claude install', () => {
    const copy = buildClaudePromptCopy(
      {
        state: 'official-only',
        official: { id: 'vercel@claude-plugins-official', version: '0.32.6' },
        latestVersion: '0.32.7',
      },
      {
        installOfficial: false,
        updateOfficial: true,
        removeLegacy: false,
        removeLegacyMarketplace: false,
      }
    );

    expect(copy.message).toBe('');
    expect(copy.confirm).toContain(
      'Working with Vercel is easier with the latest Vercel Plugin for Claude Code'
    );
    expect(copy.confirm).toContain('0.32.6 to 0.32.7');
  });
});

describe('autoInstallVercelPlugin', () => {
  it('swallows unreadable prefs files', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'vercel-cli-agent-prefs-'));

    try {
      client.setArgv('--global-config', configDir);
      client.agentName = KNOWN_AGENTS.CODEX;
      await writeFile(join(configDir, 'agent-preferences.json'), '{', 'utf8');

      await expect(autoInstallVercelPlugin(client)).resolves.toBeUndefined();
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });
});

describe('projectHasUsedClaudeCode', () => {
  let fakeHome: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), 'vercel-cli-cc-home-'));
    await mkdir(join(fakeHome, '.claude', 'projects'), { recursive: true });
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
  });

  afterEach(async () => {
    restoreEnv('HOME', originalHome);
    restoreEnv('USERPROFILE', originalUserProfile);
    await rm(fakeHome, { recursive: true, force: true });
  });

  function restoreEnv(key: string, value: string | undefined): void {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  async function recordProject(projectPath: string): Promise<void> {
    await mkdir(
      join(
        fakeHome,
        '.claude',
        'projects',
        resolve(projectPath).replace(/[^A-Za-z0-9]/g, '-')
      ),
      { recursive: true }
    );
  }

  it('matches when cwd is exactly a recorded project', async () => {
    await recordProject('/work/project-a');
    expect(await projectHasUsedClaudeCode('/work/project-a')).toBe(true);
  });

  it('matches a parent directory (walk-up, no git required)', async () => {
    await recordProject('/work/project-b');
    expect(
      await projectHasUsedClaudeCode('/work/project-b/packages/app/src')
    ).toBe(true);
  });

  it('does not match when no ancestor has Claude Code history', async () => {
    await recordProject('/work/project-b');
    expect(await projectHasUsedClaudeCode('/work/project-c/sub')).toBe(false);
  });

  it('does not match a descendant of cwd (only walks up)', async () => {
    await recordProject('/work/project-d/child');
    expect(await projectHasUsedClaudeCode('/work/project-d')).toBe(false);
  });

  it('does not match the home directory itself', async () => {
    await recordProject(fakeHome);
    expect(await projectHasUsedClaudeCode(join(fakeHome, 'x', 'deep'))).toBe(
      false
    );
  });
});
