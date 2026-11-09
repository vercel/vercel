import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

import {
  buildClaudePromptCopy,
  buildClaudePluginMigrationPlan,
  buildClaudePluginStatus,
  comparePluginVersions,
  hasClaudeVercelPlugin,
  setupVercelPlugin,
} from '../../../src/util/agent/auto-install-agentic';
import { client } from '../../mocks/client';

function mockClaudeCommand(stdout = '[]', exitCode = 0) {
  spawnMock.mockReturnValue({
    stdout: {
      on(event: string, callback: (chunk: Buffer) => void) {
        if (event === 'data' && stdout) {
          callback(Buffer.from(stdout));
        }
      },
    },
    stderr: {
      on() {},
    },
    on(event: string, callback: (code: number) => void) {
      if (event === 'close') {
        callback(exitCode);
      }
    },
  });
}

describe('comparePluginVersions', () => {
  it('compares dot-separated versions', () => {
    expect(comparePluginVersions('0.32.7', '0.32.7')).toBe(0);
    expect(comparePluginVersions('0.32.8', '0.32.7')).toBe(1);
    expect(comparePluginVersions('0.32.7', '0.32.8')).toBe(-1);
    expect(comparePluginVersions('1.0.0', '0.99.9')).toBe(1);
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

    expect(copy.message).toBe(
      'Vercel Plugin for Claude Code is not installed.'
    );
    expect(copy.confirm).toBe('Would you like to install it now?');
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

    expect(copy.message).toBe(
      'Update available for Vercel Plugin for Claude Code (legacy -> official).'
    );
    expect(copy.confirm).toBe('Would you like to update now?');
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

    expect(copy.message).toBe(
      'Vercel Plugin for Claude Code has a legacy install to clean up.'
    );
    expect(copy.confirm).toBe('Would you like to update now?');
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

    expect(copy.message).toBe(
      'Update available for Vercel Plugin for Claude Code (v0.32.6 -> v0.32.7).'
    );
    expect(copy.confirm).toBe('Would you like to update now?');
  });
});

describe('setupVercelPlugin', () => {
  let fetchSpy: { mockRestore(): void };
  let home: string;
  let configDir: string;
  let savedClaudeConfigDir: string | undefined;

  // A stateful stand-in for the `claude` CLI: `plugins list --json` reflects
  // whatever `plugins install` / `plugins update` has done so far, so the
  // post-install status check sees the result of the migration. With
  // `marketplaces`, it also tracks configured marketplaces, and installing
  // from a marketplace that isn't configured fails as it does in Claude Code.
  function mockStatefulClaude(
    initial: Array<{ id: string; version?: string; installPath?: string }>,
    failure?: { action: string; exitCode: number },
    opts?: { marketplaces?: string[]; failMarketplaceAdd?: boolean }
  ) {
    let installed = [...initial];
    const marketplaces = opts?.marketplaces && [...opts.marketplaces];
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      let stdout = '';
      let skipAction = args[1] === failure?.action;
      if (marketplaces && args[1] === 'marketplace' && args[2] === 'list') {
        stdout = JSON.stringify(marketplaces.map(name => ({ name })));
      } else if (
        marketplaces &&
        args[1] === 'marketplace' &&
        args[2] === 'add'
      ) {
        skipAction = opts?.failMarketplaceAdd === true;
        if (!skipAction) marketplaces.push(args[3].split('/')[1]);
      } else if (
        marketplaces &&
        args[1] === 'install' &&
        !marketplaces.includes(args[2].split('@')[1])
      ) {
        skipAction = true;
      }
      if (args[0] === 'plugins' && args[1] === 'list') {
        stdout = JSON.stringify(installed);
      } else if (
        !skipAction &&
        args[0] === 'plugins' &&
        args[1] === 'install'
      ) {
        installed = installed.filter(p => p.id !== args[2]);
        installed.push({ id: args[2], version: '0.40.0' });
      } else if (!skipAction && args[0] === 'plugins' && args[1] === 'update') {
        installed = installed.map(p =>
          p.id === args[2] ? { ...p, version: '0.40.0' } : p
        );
      } else if (
        !skipAction &&
        args[0] === 'plugins' &&
        args[1] === 'uninstall'
      ) {
        installed = installed.filter(p => p.id !== args[2]);
      }
      return {
        stdout: {
          on(event: string, callback: (chunk: Buffer) => void) {
            if (event === 'data' && stdout) callback(Buffer.from(stdout));
          },
        },
        stderr: { on() {} },
        on(event: string, callback: (code: number) => void) {
          if (event === 'close')
            callback(skipAction ? (failure?.exitCode ?? 1) : 0);
        },
      };
    });
  }

  function claudeMarketplaceAddCalls() {
    return spawnMock.mock.calls.filter(
      ([cmd, args]) =>
        cmd === 'claude' && args[1] === 'marketplace' && args[2] === 'add'
    );
  }

  function claudeInstallCalls() {
    return spawnMock.mock.calls.filter(
      ([cmd, args]) =>
        cmd === 'claude' && args[0] === 'plugins' && args[1] === 'install'
    );
  }

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'vercel-cli-setup-home-'));
    configDir = await mkdtemp(join(tmpdir(), 'vercel-cli-setup-prefs-'));
    // The Claude Code agent honors CLAUDE_CONFIG_DIR, which would bypass the
    // fake home when this suite runs inside Claude Code itself.
    savedClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ version: '0.40.0' }), { status: 200 })
      );
    spawnMock.mockReset();
    client.setArgv('--global-config', configDir);
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
    client.reset();
    if (savedClaudeConfigDir === undefined)
      delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = savedClaudeConfigDir;
    await rm(home, { recursive: true, force: true });
    await rm(configDir, { recursive: true, force: true });
  });

  it('skips when Claude Code is not detected without touching the claude CLI', async () => {
    mockStatefulClaude([]);
    const result = await setupVercelPlugin(client, {
      yes: true,
      dryRun: false,
      canPrompt: false,
      home,
    });
    expect(result.status).toBe('not_detected');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('reports up_to_date when the official plugin is current', async () => {
    await mkdir(join(home, '.claude'), { recursive: true });
    mockStatefulClaude([
      { id: 'vercel@claude-plugins-official', version: '0.40.0' },
    ]);
    const result = await setupVercelPlugin(client, {
      yes: false,
      dryRun: false,
      canPrompt: true,
      home,
    });
    expect(result.status).toBe('up_to_date');
    expect(result.message).toContain('v0.40.0');
    expect(claudeInstallCalls()).toHaveLength(0);
  });

  it('describes the plan without applying it on --dry-run', async () => {
    await mkdir(join(home, '.claude'), { recursive: true });
    mockStatefulClaude([]);
    const result = await setupVercelPlugin(client, {
      yes: true,
      dryRun: true,
      canPrompt: false,
      home,
    });
    expect(result.status).toBe('dry_run');
    expect(result.action).toBe('install');
    expect(result.message).toContain('install the official plugin');
    expect(claudeInstallCalls()).toHaveLength(0);
  });

  it('reports missing official plugin files instead of claiming setup is current', async () => {
    await mkdir(join(home, '.claude'), { recursive: true });
    mockStatefulClaude([
      {
        id: 'vercel@claude-plugins-official',
        version: '0.40.0',
        installPath: join(home, '.claude', 'plugins', 'missing'),
      },
    ]);
    const result = await setupVercelPlugin(client, {
      yes: true,
      dryRun: false,
      canPrompt: false,
      home,
    });
    expect(result.status).toBe('failed');
    expect(result.message).toContain('files are missing');
    expect(result.message).toContain(
      'claude plugins uninstall vercel@claude-plugins-official'
    );
    expect(result.message).not.toContain('is installed');
    expect(claudeInstallCalls()).toHaveLength(0);
  });

  it('requires --yes when it cannot prompt', async () => {
    await mkdir(join(home, '.claude'), { recursive: true });
    mockStatefulClaude([]);
    const confirmSpy = vi.spyOn(client.input, 'confirm');
    const result = await setupVercelPlugin(client, {
      yes: false,
      dryRun: false,
      canPrompt: false,
      home,
    });
    expect(result.status).toBe('confirmation_required');
    expect(result.message).toContain('--yes');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(claudeInstallCalls()).toHaveLength(0);
  });

  it('installs after the user confirms and enables automatic updates', async () => {
    await mkdir(join(home, '.claude'), { recursive: true });
    mockStatefulClaude([]);
    client.stdin.write('y\n');
    const result = await setupVercelPlugin(client, {
      yes: false,
      dryRun: false,
      canPrompt: true,
      home,
    });
    expect(result.status).toBe('installed');
    expect(result.message).toContain('Installed the Vercel plugin');
    expect(claudeInstallCalls()).toHaveLength(1);
    expect(claudeInstallCalls()[0][1]).toEqual([
      'plugins',
      'install',
      'vercel@claude-plugins-official',
    ]);
    const prefs = JSON.parse(
      await readFile(join(configDir, 'agent-preferences.json'), 'utf8')
    );
    expect(prefs.pluginDeclined).toBe(false);
    expect(prefs.pluginAutoUpdate).toBe(true);
  });

  it('records a decline and does not install', async () => {
    await mkdir(join(home, '.claude'), { recursive: true });
    mockStatefulClaude([]);
    client.stdin.write('n\n');
    const result = await setupVercelPlugin(client, {
      yes: false,
      dryRun: false,
      canPrompt: true,
      home,
    });
    expect(result.status).toBe('declined');
    expect(claudeInstallCalls()).toHaveLength(0);
    const prefs = JSON.parse(
      await readFile(join(configDir, 'agent-preferences.json'), 'utf8')
    );
    expect(prefs.pluginDeclined).toBe(true);
  });

  it('ignores an earlier decline when the user runs setup explicitly with --yes', async () => {
    await mkdir(join(home, '.claude'), { recursive: true });
    await writeFile(
      join(configDir, 'agent-preferences.json'),
      JSON.stringify({ pluginDeclined: true, lastPromptedAt: new Date() }),
      'utf8'
    );
    mockStatefulClaude([]);
    const confirmSpy = vi.spyOn(client.input, 'confirm');
    const result = await setupVercelPlugin(client, {
      yes: true,
      dryRun: false,
      canPrompt: true,
      home,
    });
    expect(result.status).toBe('installed');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(claudeInstallCalls()).toHaveLength(1);
  });

  it('adds the official marketplace before installing on a fresh Claude config', async () => {
    await mkdir(join(home, '.claude'), { recursive: true });
    mockStatefulClaude([], undefined, { marketplaces: [] });
    const result = await setupVercelPlugin(client, {
      yes: true,
      dryRun: false,
      canPrompt: false,
      home,
    });
    expect(result.status).toBe('installed');
    expect(claudeMarketplaceAddCalls()).toHaveLength(1);
    expect(claudeMarketplaceAddCalls()[0][1]).toEqual([
      'plugins',
      'marketplace',
      'add',
      'anthropics/claude-plugins-official',
    ]);
    const calls = spawnMock.mock.calls.map(([, args]) => args.join(' '));
    expect(
      calls.indexOf(
        'plugins marketplace add anthropics/claude-plugins-official'
      )
    ).toBeLessThan(
      calls.indexOf('plugins install vercel@claude-plugins-official')
    );
  });

  it('reports an install that gets an older version than vercel-plugin main as installed', async () => {
    await mkdir(join(home, '.claude'), { recursive: true });
    // The marketplace serves 0.40.0 while vercel-plugin main is at 0.50.0.
    fetchSpy.mockRestore();
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ version: '0.50.0' }), { status: 200 })
      );
    mockStatefulClaude([]);
    const result = await setupVercelPlugin(client, {
      yes: true,
      dryRun: false,
      canPrompt: false,
      home,
    });
    expect(result).toEqual({
      status: 'installed',
      message: 'Installed the Vercel plugin for Claude Code v0.40.0.',
    });
  });

  it('does not add the official marketplace when it is configured', async () => {
    await mkdir(join(home, '.claude'), { recursive: true });
    mockStatefulClaude([], undefined, {
      marketplaces: ['claude-plugins-official'],
    });
    const result = await setupVercelPlugin(client, {
      yes: true,
      dryRun: false,
      canPrompt: false,
      home,
    });
    expect(result.status).toBe('installed');
    expect(claudeMarketplaceAddCalls()).toHaveLength(0);
  });

  it('fails without installing when the official marketplace cannot be added', async () => {
    await mkdir(join(home, '.claude'), { recursive: true });
    mockStatefulClaude([], undefined, {
      marketplaces: [],
      failMarketplaceAdd: true,
    });
    const result = await setupVercelPlugin(client, {
      yes: true,
      dryRun: false,
      canPrompt: false,
      home,
    });
    expect(result.status).toBe('failed');
    expect(claudeInstallCalls()).toHaveLength(0);
    expect(client.stderr.getFullOutput()).toContain(
      'claude plugins marketplace add anthropics/claude-plugins-official'
    );
  });

  it('updates an outdated official install', async () => {
    await mkdir(join(home, '.claude'), { recursive: true });
    mockStatefulClaude([
      { id: 'vercel@claude-plugins-official', version: '0.30.0' },
    ]);
    const result = await setupVercelPlugin(client, {
      yes: true,
      dryRun: false,
      canPrompt: false,
      home,
    });
    expect(result.status).toBe('updated');
    expect(result.message).toContain('v0.40.0');
    expect(spawnMock).toHaveBeenCalledWith(
      'claude',
      ['plugins', 'update', 'vercel@claude-plugins-official'],
      expect.any(Object)
    );
  });

  it('reports failure when the install does not take effect', async () => {
    await mkdir(join(home, '.claude'), { recursive: true });
    // Every claude call "succeeds" but the plugin list never changes.
    mockClaudeCommand('[]');
    const result = await setupVercelPlugin(client, {
      yes: true,
      dryRun: false,
      canPrompt: false,
      home,
    });
    expect(result.status).toBe('failed');
    expect(result.message).toContain(
      'claude plugins install vercel@claude-plugins-official'
    );
  });

  it.each([
    0, 1,
  ])('fails when an update exits %s but leaves the old version installed', async exitCode => {
    await mkdir(join(home, '.claude'), { recursive: true });
    mockStatefulClaude(
      [{ id: 'vercel@claude-plugins-official', version: '0.30.0' }],
      { action: 'update', exitCode }
    );
    const result = await setupVercelPlugin(client, {
      yes: true,
      dryRun: false,
      canPrompt: false,
      home,
    });
    expect(result.status).toBe('failed');
    expect(result.message).toContain(
      'vercel setup plugin --agent claude-code --yes'
    );
    expect(result.message).not.toContain('Updated the Vercel plugin');
  });

  it.each([
    'uninstall',
    'marketplace',
  ])('fails when legacy %s cleanup fails', async action => {
    await mkdir(join(home, '.claude'), { recursive: true });
    mockStatefulClaude(
      [
        { id: 'vercel@claude-plugins-official', version: '0.40.0' },
        { id: 'vercel-plugin@vercel', version: '0.30.0' },
      ],
      { action, exitCode: 1 }
    );
    const result = await setupVercelPlugin(client, {
      yes: true,
      dryRun: false,
      canPrompt: false,
      home,
    });
    expect(result.status).toBe('failed');
    expect(result.message).not.toContain('Updated the Vercel plugin');
  });
});

describe('hasClaudeVercelPlugin', () => {
  let home: string;
  let savedClaudeConfigDir: string | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'vercel-cli-claude-registry-'));
    savedClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  afterEach(async () => {
    if (savedClaudeConfigDir === undefined)
      delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = savedClaudeConfigDir;
    await rm(home, { recursive: true, force: true });
  });

  async function writeRegistry(
    ids: string[],
    configDir = join(home, '.claude')
  ) {
    const dir = join(configDir, 'plugins');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'installed_plugins.json'),
      JSON.stringify({
        plugins: Object.fromEntries(
          ids.map(id => [id, [{ version: '1.0.0' }]])
        ),
      }),
      'utf8'
    );
  }

  it.each([
    'vercel@claude-plugins-official',
    'vercel@anthropic-plugin-directory',
  ])('finds %s', async id => {
    await writeRegistry([id]);
    expect(await hasClaudeVercelPlugin(home)).toBe(true);
  });

  it('does not count the legacy plugin, which setup migrates', async () => {
    await writeRegistry(['vercel-plugin@vercel']);
    expect(await hasClaudeVercelPlugin(home)).toBe(false);
  });

  it('returns false without a registry', async () => {
    expect(await hasClaudeVercelPlugin(home)).toBe(false);
  });

  it('reads the registry in CLAUDE_CONFIG_DIR instead of ~/.claude', async () => {
    const configDir = join(home, 'custom-claude');
    process.env.CLAUDE_CONFIG_DIR = configDir;
    await writeRegistry(['vercel@claude-plugins-official']);
    expect(await hasClaudeVercelPlugin(home)).toBe(false);

    await writeRegistry(['vercel@claude-plugins-official'], configDir);
    expect(await hasClaudeVercelPlugin(home)).toBe(true);
  });
});
