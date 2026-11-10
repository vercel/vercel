import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import stripAnsi from 'strip-ansi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readGlobalConfigFile,
  writeGlobalConfigFile,
} from '@vercel/cli-config';
import {
  hasClaudeVercelPlugin,
  setupVercelPlugin,
} from '../../../src/util/agent/auto-install-agentic';
import {
  offerVercelPluginToNewUser,
  PLUGIN_OFFER_TIMEOUT_MS,
} from '../../../src/util/agent/plugin-offer';
import { setupCodexPlugin } from '../../../src/util/agent/setup-codex-plugin';
import { claudeCode } from '../../../src/util/ai-gateway/coding-agents/agents/claude-code';
import { getConfigFilePath } from '../../../src/util/config/files';
import { client } from '../../mocks/client';

const ciInfo = vi.hoisted(() => ({ isCI: false }));
vi.mock('ci-info', () => ({ default: ciInfo }));

vi.mock(
  '../../../src/util/agent/auto-install-agentic',
  async importOriginal => ({
    ...(await importOriginal<
      typeof import('../../../src/util/agent/auto-install-agentic')
    >()),
    hasClaudeVercelPlugin: vi.fn(),
    setupVercelPlugin: vi.fn(),
  })
);

vi.mock('../../../src/util/agent/setup-codex-plugin', () => ({
  setupCodexPlugin: vi.fn(),
}));

const PROMPT = 'Install Vercel Plugin for coding agents?';

function prefsPath() {
  return join(client.getGlobalPathConfig(), 'agent-preferences.json');
}

async function readPrefs() {
  return JSON.parse(await readFile(prefsPath(), 'utf8'));
}

function savedUsedBefore() {
  return readGlobalConfigFile(getConfigFilePath()).usedBefore;
}

/** Runs the offer for `whoami` and types `answer` once the prompt shows. */
async function offerAndAnswer(answer: string) {
  const offer = offerVercelPluginToNewUser(client, 0, 'whoami');
  await expect(client.stderr).toOutput(PROMPT);
  client.stdin.write(answer);
  await offer;
}

function setupCalls() {
  return [
    ...vi.mocked(setupVercelPlugin).mock.calls,
    ...vi.mocked(setupCodexPlugin).mock.calls,
  ].filter(([, opts]) => !opts.dryRun);
}

describe('offerVercelPluginToNewUser', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    client.reset();
    ciInfo.isCI = false;
    // A config the CLI just created for a first-time user.
    client.config = { usedBefore: false };
    writeGlobalConfigFile(getConfigFilePath(), { usedBefore: false });
    await rm(prefsPath(), { force: true });

    // Claude Code and Codex are installed without the plugin.
    vi.spyOn(claudeCode, 'detect').mockResolvedValue(true);
    vi.mocked(hasClaudeVercelPlugin).mockResolvedValue(false);
    vi.mocked(setupVercelPlugin).mockResolvedValue({
      status: 'installed',
      message: 'Installed the Vercel plugin for Claude Code v0.50.0.',
    });
    vi.mocked(setupCodexPlugin).mockImplementation(async (_client, opts) =>
      opts.dryRun
        ? { status: 'dry_run', action: 'install', message: '' }
        : {
            status: 'installed',
            message: 'Installed the Vercel plugin for Codex v0.54.1.',
          }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('installs for Claude Code and Codex when the user says yes', async () => {
    await offerAndAnswer('y\n');

    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr).toContain(`? ${PROMPT} (Y/n)`);
    expect(stderr).toContain(
      'Installed the Vercel plugin for Claude Code v0.50.0.'
    );
    expect(stderr).toContain('Installed the Vercel plugin for Codex v0.54.1.');
    const opts = { yes: true, dryRun: false, canPrompt: false };
    expect(setupVercelPlugin).toHaveBeenCalledWith(
      client,
      expect.objectContaining(opts)
    );
    expect(setupCodexPlugin).toHaveBeenCalledWith(
      client,
      expect.objectContaining(opts)
    );
    expect(await readPrefs()).toMatchObject({
      pluginDeclined: false,
      pluginAutoUpdate: true,
    });
    expect(savedUsedBefore()).toBe(true);
    expect(client.config.usedBefore).toBe(true);
  });

  it('installs on Enter, since yes is the default', async () => {
    await offerAndAnswer('\n');
    expect(setupCalls()).toHaveLength(2);
    expect((await readPrefs()).pluginDeclined).toBe(false);
  });

  it('saves a no and installs nothing', async () => {
    await offerAndAnswer('n\n');

    expect(client.stderr.getFullOutput()).toContain(PROMPT);
    expect(setupCalls()).toHaveLength(0);
    expect(await readPrefs()).toMatchObject({
      pluginDeclined: true,
      pluginAutoUpdate: false,
    });
    expect(savedUsedBefore()).toBe(true);
  });

  it('installs only for the agent that is missing the plugin', async () => {
    vi.mocked(hasClaudeVercelPlugin).mockResolvedValue(true);
    await offerAndAnswer('y\n');

    expect(setupCalls()).toHaveLength(1);
    expect(setupVercelPlugin).not.toHaveBeenCalled();
  });

  it('offers to a Codex that cannot list plugins, so setup can explain why', async () => {
    vi.mocked(claudeCode.detect).mockResolvedValue(false);
    vi.mocked(setupCodexPlugin).mockResolvedValue({
      status: 'failed',
      message:
        "Can't install the Vercel plugin for Codex without a ChatGPT sign-in. Run `codex login`, then `vercel setup plugin --agent codex`.",
    });
    await offerAndAnswer('y\n');

    expect(client.stderr.getFullOutput()).toContain(
      "Can't install the Vercel plugin for Codex without a ChatGPT sign-in."
    );
  });

  it('ignores an Enter typed while the command was running', async () => {
    // Typed before the prompt; it must not accept the default.
    client.stdin.write('\n');
    await offerAndAnswer('n\n');

    expect(setupCalls()).toHaveLength(0);
    expect((await readPrefs()).pluginDeclined).toBe(true);
  });

  it('does not keep the CLI running while it waits for an answer', async () => {
    // Ctrl+C closes the prompt without settling it; only the timer is left.
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const offer = offerVercelPluginToNewUser(client, 0, 'whoami');
    await expect(client.stderr).toOutput(PROMPT);
    const index = setTimeoutSpy.mock.calls.findIndex(
      ([, ms]) => ms === PLUGIN_OFFER_TIMEOUT_MS
    );
    const timer = setTimeoutSpy.mock.results[index].value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);
    client.stdin.write('n\n');
    await offer;
  });

  it('skips the prompt and saves no answer after the timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const offer = offerVercelPluginToNewUser(client, 0, 'whoami');
    // Advances the fake timers until the prompt shows.
    await vi.waitFor(() =>
      expect(client.stderr.getFullOutput()).toContain(PROMPT)
    );
    await vi.advanceTimersByTimeAsync(PLUGIN_OFFER_TIMEOUT_MS);
    await offer;

    expect(client.stderr.getFullOutput()).toContain(
      'No answer after 30 seconds. Run `vercel setup plugin` to install it later.'
    );
    expect(setupCalls()).toHaveLength(0);
    await expect(readFile(prefsPath(), 'utf8')).rejects.toThrow();
    // An unattended terminal is never asked again.
    expect(savedUsedBefore()).toBe(true);
  });

  it.each([
    ['an existing user', () => (client.config = {})],
    ['a user who has used the CLI', () => (client.config.usedBefore = true)],
  ])('never offers to %s', async (_name, arrange) => {
    arrange();
    await offerVercelPluginToNewUser(client, 0, 'whoami');

    expect(client.stderr.getFullOutput()).not.toContain(PROMPT);
    expect(claudeCode.detect).not.toHaveBeenCalled();
    expect(setupCodexPlugin).not.toHaveBeenCalled();
  });

  it.each([
    ['an agent', () => (client.isAgent = true)],
    ['--non-interactive', () => (client.nonInteractive = true)],
    ['CI', () => (ciInfo.isCI = true)],
    ['stdin without a terminal', () => (client.stdin.isTTY = false)],
    ['stderr without a terminal', () => (client.stderr.isTTY = false)],
    ['--json', () => client.setArgv('whoami', '--json')],
    ['--format json', () => client.setArgv('whoami', '--format', 'json')],
    // `install` renders its own help, so it runs as a command.
    ['--help', () => client.setArgv('install', '--help')],
    ['-h', () => client.setArgv('install', '-h')],
  ])('keeps the offer for later without prompting for %s', async (_name, arrange) => {
    arrange();
    await offerVercelPluginToNewUser(client, 0, 'whoami');

    expect(client.stderr.getFullOutput()).not.toContain(PROMPT);
    expect(claudeCode.detect).not.toHaveBeenCalled();
    expect(setupCodexPlugin).not.toHaveBeenCalled();
    expect(savedUsedBefore()).toBe(false);
  });

  it.each([
    ['env pull', ['env', 'pull'], 'env'],
    ['env pull --yes', ['env', 'pull', '--yes'], 'env'],
    [
      '--cwd /tmp env pull .env.local',
      ['--cwd', '/tmp', 'env', 'pull', '.env.local'],
      'env',
    ],
    ['pull', ['pull'], 'pull'],
    ['pull --yes', ['pull', '--yes'], 'pull'],
  ])('keeps the offer for later after `vercel %s`', async (_name, argv, command) => {
    client.setArgv(argv);
    await offerVercelPluginToNewUser(client, 0, command);

    expect(client.stderr.getFullOutput()).not.toContain(PROMPT);
    expect(claudeCode.detect).not.toHaveBeenCalled();
    expect(savedUsedBefore()).toBe(false);
  });

  it('still offers after other `vercel env` commands', async () => {
    client.setArgv('env', 'ls');
    const offer = offerVercelPluginToNewUser(client, 0, 'env');
    await expect(client.stderr).toOutput(PROMPT);
    client.stdin.write('n\n');
    await offer;
  });

  it.each([
    ['a failed command', 1, 'whoami'],
    ['a usage error', 2, 'whoami'],
    ['help or --version, which run no command', 0, undefined],
  ])('keeps the offer for later after %s', async (_name, exitCode, command) => {
    await offerVercelPluginToNewUser(client, exitCode, command);

    expect(client.stderr.getFullOutput()).not.toContain(PROMPT);
    expect(savedUsedBefore()).toBe(false);
  });

  it.each([
    ['a saved no', { pluginDeclined: true }],
    ['a saved yes', { pluginDeclined: false }],
  ])('does not prompt after %s', async (_name, prefs) => {
    await writeFile(prefsPath(), JSON.stringify(prefs), 'utf8');
    await offerVercelPluginToNewUser(client, 0, 'whoami');

    expect(client.stderr.getFullOutput()).not.toContain(PROMPT);
    expect(setupCalls()).toHaveLength(0);
    expect(savedUsedBefore()).toBe(true);
  });

  it('does not prompt after `vercel setup`', async () => {
    await offerVercelPluginToNewUser(client, 0, 'setup');

    expect(client.stderr.getFullOutput()).not.toContain(PROMPT);
    expect(savedUsedBefore()).toBe(true);
  });

  it('does not prompt when every agent already has the plugin', async () => {
    vi.mocked(hasClaudeVercelPlugin).mockResolvedValue(true);
    vi.mocked(setupCodexPlugin).mockResolvedValue({
      status: 'up_to_date',
      message: 'Vercel plugin for Codex is installed (v0.54.1).',
    });
    await offerVercelPluginToNewUser(client, 0, 'whoami');

    expect(client.stderr.getFullOutput()).not.toContain(PROMPT);
    expect(savedUsedBefore()).toBe(true);
  });

  it('does not prompt when no coding agent is installed', async () => {
    vi.mocked(claudeCode.detect).mockResolvedValue(false);
    vi.mocked(setupCodexPlugin).mockResolvedValue({
      status: 'not_detected',
      message: 'Codex was not detected on this machine.',
    });
    await offerVercelPluginToNewUser(client, 0, 'whoami');

    expect(client.stderr.getFullOutput()).not.toContain(PROMPT);
    expect(hasClaudeVercelPlugin).not.toHaveBeenCalled();
    expect(savedUsedBefore()).toBe(true);
  });
});
