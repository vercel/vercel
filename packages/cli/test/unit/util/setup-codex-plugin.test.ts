import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupCodexPlugin } from '../../../src/util/agent/setup-codex-plugin';
import { codex } from '../../../src/util/ai-gateway/coding-agents/agents/codex';
import { client } from '../../mocks/client';

const execaMock = vi.hoisted(() => vi.fn());
vi.mock('execa', () => ({ default: execaMock }));

const pluginId = 'vercel@openai-curated-remote';
const options = {
  yes: true,
  dryRun: false,
  canPrompt: false,
  home: '/test-home',
};
type Plugin = { pluginId: string; enabled: boolean; version?: string };

function mockCodex(
  initial: Plugin[] = [],
  opts: { apply?: boolean; appsNeedingAuth?: unknown[] } = {}
) {
  let installed = [...initial];
  execaMock.mockImplementation(async (_command: string, args: string[]) => {
    if (args[1] === 'list') {
      return { stdout: JSON.stringify({ installed }) };
    }
    if (args[1] === 'add') {
      if (opts.apply !== false) {
        installed = [
          ...installed.filter(plugin => plugin.pluginId !== pluginId),
          { pluginId, enabled: true, version: '0.21.4' },
        ];
      }
      return {
        stdout: JSON.stringify({
          authPolicy: 'ON_INSTALL',
          appsNeedingAuth: opts.appsNeedingAuth ?? [],
        }),
      };
    }
    throw new Error(`Unexpected Codex command: ${args.join(' ')}`);
  });
}

function installCalls() {
  return execaMock.mock.calls.filter(([, args]) => args[1] === 'add');
}

describe('setupCodexPlugin', () => {
  beforeEach(() => {
    client.reset();
    execaMock.mockReset();
    vi.spyOn(codex, 'detect').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips an undetected Codex installation without invoking its CLI', async () => {
    vi.mocked(codex.detect).mockResolvedValue(false);
    expect(await setupCodexPlugin(client, options)).toMatchObject({
      status: 'not_detected',
    });
    expect(codex.detect).toHaveBeenCalledWith(options.home);
    expect(execaMock).not.toHaveBeenCalled();
  });

  it('keeps an enabled native plugin installed without reinstalling it', async () => {
    mockCodex([{ pluginId, enabled: true, version: '0.21.4' }]);
    expect(await setupCodexPlugin(client, options)).toEqual({
      status: 'up_to_date',
      message: 'Vercel plugin for Codex is installed (v0.21.4).',
    });
    expect(installCalls()).toHaveLength(0);
  });

  it('installs the official Codex plugin and is a no-op on the next run', async () => {
    mockCodex();
    const confirm = vi.spyOn(client.input, 'confirm');
    expect(await setupCodexPlugin(client, options)).toMatchObject({
      status: 'installed',
      message: expect.stringContaining('Start a new Codex session'),
    });
    expect(installCalls()).toHaveLength(1);
    expect(installCalls()[0]).toEqual([
      'codex',
      ['plugin', 'add', pluginId, '--json'],
      expect.objectContaining({ stdin: 'ignore', timeout: 60_000 }),
    ]);
    expect(confirm).not.toHaveBeenCalled();
    expect(await setupCodexPlugin(client, options)).toMatchObject({
      status: 'up_to_date',
    });
    expect(installCalls()).toHaveLength(1);
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('does not mistake a similarly named local plugin for the official plugin', async () => {
    mockCodex([{ pluginId: 'vercel@personal', enabled: true }]);
    expect(await setupCodexPlugin(client, options)).toMatchObject({
      status: 'installed',
    });
    expect(installCalls()).toHaveLength(1);
  });

  it('enables an installed but disabled plugin', async () => {
    mockCodex([{ pluginId, enabled: false }]);
    expect(await setupCodexPlugin(client, options)).toMatchObject({
      status: 'enabled',
      message: expect.stringContaining('Enabled the Vercel plugin for Codex'),
    });
    expect(installCalls()).toHaveLength(1);
  });

  it.each([
    [[], 'install'],
    [[{ pluginId, enabled: false }], 'enable'],
  ] as const)('previews the native operation without installing', async (plugins, action) => {
    mockCodex([...plugins]);
    expect(
      await setupCodexPlugin(client, { ...options, dryRun: true })
    ).toMatchObject({
      status: 'dry_run',
      action,
    });
    expect(installCalls()).toHaveLength(0);
  });

  it('requires --yes when prompting is unavailable', async () => {
    mockCodex();
    const confirm = vi.spyOn(client.input, 'confirm');
    expect(
      await setupCodexPlugin(client, { ...options, yes: false })
    ).toMatchObject({
      status: 'confirmation_required',
      message: expect.stringContaining('--yes'),
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(installCalls()).toHaveLength(0);
  });

  it.each([
    true,
    false,
  ])('respects the interactive choice: %s', async accepted => {
    mockCodex();
    const confirm = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(accepted);
    const result = await setupCodexPlugin(client, {
      ...options,
      yes: false,
      canPrompt: true,
    });
    expect(result.status).toBe(accepted ? 'installed' : 'declined');
    expect(confirm).toHaveBeenCalledWith('Install this plugin?', true);
    expect(installCalls()).toHaveLength(accepted ? 1 : 0);
    expect(client.stderr.getFullOutput()).toContain(
      'Vercel for Codex (OpenAI marketplace)'
    );
  });

  it.each([
    'unavailable',
    'malformed JSON',
    'unexpected schema',
  ])('fails safely when listing plugins returns %s', async failure => {
    if (failure === 'unavailable') {
      execaMock.mockRejectedValue(new Error('unknown subcommand plugin'));
    } else {
      execaMock.mockResolvedValue({
        stdout: failure === 'malformed JSON' ? 'not json' : '{}',
      });
    }
    expect(await setupCodexPlugin(client, options)).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('Install or update the Codex CLI'),
    });
    expect(installCalls()).toHaveLength(0);
  });

  it.each([
    'list',
    'add',
  ])('asks for a ChatGPT sign-in when `codex plugin %s` needs one', async command => {
    mockCodex();
    const signInError = Object.assign(new Error('Command failed: codex'), {
      stderr:
        'Error: chatgpt authentication required for remote plugin catalog',
    });
    if (command === 'list') {
      execaMock.mockRejectedValueOnce(signInError);
    } else {
      execaMock.mockResolvedValueOnce({ stdout: '{"installed":[]}' });
      execaMock.mockRejectedValueOnce(signInError);
    }
    expect(await setupCodexPlugin(client, options)).toEqual({
      status: 'failed',
      message:
        "Can't install the Vercel plugin for Codex without a ChatGPT sign-in. Run `codex login`, then `vercel setup plugin --agent codex`.",
    });
  });

  it('reports a failed native install without exposing subprocess output', async () => {
    mockCodex();
    execaMock.mockResolvedValueOnce({ stdout: '{"installed":[]}' });
    execaMock.mockRejectedValueOnce(new Error('credential=private-token'));
    const result = await setupCodexPlugin(client, options);
    expect(result.status).toBe('failed');
    expect(result.message).toContain(`codex plugin add ${pluginId}`);
    expect(JSON.stringify(result)).not.toContain('private-token');
    expect(client.stdout.getFullOutput()).not.toContain('private-token');
    expect(client.stderr.getFullOutput()).not.toContain('private-token');
  });

  it.each([
    { plugins: [] as Plugin[] },
    { plugins: [{ pluginId, enabled: false }] },
  ])('fails when a successful subprocess leaves the plugin unavailable', async ({
    plugins,
  }) => {
    mockCodex(plugins, { apply: false });
    const result = await setupCodexPlugin(client, options);
    expect(result.status).toBe('failed');
    expect(result.message).toContain('not enabled');
    expect(result.message).not.toContain('Installed the Vercel plugin');
  });

  it('surfaces a pending account connection without exposing connection URLs', async () => {
    mockCodex([], {
      appsNeedingAuth: [
        { id: 'vercel', installUrl: 'https://example.test/private-oauth' },
      ],
    });
    const result = await setupCodexPlugin(client, options);
    expect(result.status).toBe('installed');
    expect(result.message).toContain(
      "Connect Vercel in Codex's /plugins browser"
    );
    expect(result.message).not.toContain('private-oauth');
  });
});
