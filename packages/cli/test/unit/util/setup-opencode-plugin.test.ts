import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupOpenCodePlugin } from '../../../src/util/agent/setup-opencode-plugin';
import { client } from '../../mocks/client';

const execaMock = vi.hoisted(() => vi.fn());
vi.mock('execa', () => ({ default: execaMock }));

const source = 'github:vercel/vercel-plugin';
let home: string;
let configDir: string;

function options(
  overrides: Partial<Parameters<typeof setupOpenCodePlugin>[1]> = {}
) {
  return { yes: true, dryRun: false, canPrompt: false, home, ...overrides };
}

function mockOpenCode(
  opts: { version?: string | Error; addFails?: boolean } = {}
) {
  execaMock.mockImplementation(async (_command: string, args: string[]) => {
    if (args[0] === '--version') {
      if (opts.version instanceof Error) throw opts.version;
      return { stdout: opts.version ?? 'opencode v2.0.25' };
    }
    if (args[0] === 'plugin' && args[1] === 'add') {
      if (opts.addFails) throw new Error('git dep preparation failed');
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, 'opencode.json'),
        JSON.stringify({ plugins: [source] })
      );
      return { stdout: `Plugin "${source}" installed and added` };
    }
    throw new Error(`Unexpected OpenCode command: ${args.join(' ')}`);
  });
}

function addCalls() {
  return execaMock.mock.calls.filter(([, args]) => args[0] === 'plugin');
}

async function writeConfig(dir: string, file: string, text: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, file), text);
}

describe('setupOpenCodePlugin', () => {
  beforeEach(async () => {
    client.reset();
    execaMock.mockReset();
    home = await mkdtemp(join(tmpdir(), 'vercel-setup-opencode-'));
    configDir = join(home, '.config', 'opencode');
    vi.stubEnv('XDG_CONFIG_HOME', '');
    vi.stubEnv('OPENCODE_CONFIG_DIR', '');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(home, { recursive: true, force: true });
  });

  it.each([
    [
      new Error('spawn opencode ENOENT'),
      'not_detected',
      'OpenCode was not detected',
    ],
    ['1.18.35', 'unsupported', 'needs OpenCode 2'],
  ])('skips OpenCode without the plugin API: %s', async (version, status, message) => {
    mockOpenCode({ version });
    expect(await setupOpenCodePlugin(client, options())).toMatchObject({
      status,
      message: expect.stringContaining(message),
    });
    expect(addCalls()).toHaveLength(0);
  });

  it.each([
    [
      'disabled after it is added',
      { 'opencode.json': [source, '-vercel-plugin'] },
      'disabled',
    ],
    ['disabled by a wildcard', { 'opencode.json': [source, '-*'] }, 'disabled'],
    [
      'disabled by the higher-precedence file',
      { 'opencode.json': [source], 'opencode.jsonc': ['-vercel-plugin'] },
      'disabled',
    ],
    [
      're-enabled by a later ID',
      { 'opencode.json': [source, '-*', 'vercel-plugin'] },
      'up_to_date',
    ],
    [
      'removed before it is added',
      { 'opencode.json': ['-vercel-plugin', source] },
      'up_to_date',
    ],
  ])('applies ordered plugin rules: %s', async (_name, files, status) => {
    mockOpenCode();
    for (const [file, plugins] of Object.entries(files)) {
      await writeConfig(configDir, file, JSON.stringify({ plugins }));
    }
    expect(await setupOpenCodePlugin(client, options())).toMatchObject({
      status,
    });
    expect(addCalls()).toHaveLength(0);
  });

  it('names the disabling rule and file with a recovery hint', async () => {
    mockOpenCode();
    await writeConfig(
      configDir,
      'opencode.jsonc',
      JSON.stringify({ plugins: [source, '-*'] })
    );
    expect(await setupOpenCodePlugin(client, options())).toEqual({
      status: 'disabled',
      message: `The Vercel plugin is disabled by "-*" in ${join(configDir, 'opencode.jsonc')}. Remove that entry or add "vercel-plugin" after it to enable the plugin.`,
    });
  });

  it('installs when the only entry is in a malformed config', async () => {
    mockOpenCode();
    await writeConfig(
      configDir,
      'opencode.jsonc',
      `{\n  "plugins": ["${source}"]\n`
    );
    expect(await setupOpenCodePlugin(client, options())).toMatchObject({
      status: 'installed',
    });
    expect(addCalls()).toHaveLength(1);
  });

  it('reads the config from OPENCODE_CONFIG_DIR', async () => {
    mockOpenCode();
    await writeConfig(
      configDir,
      'opencode.json',
      JSON.stringify({ plugins: [source] })
    );
    configDir = join(home, 'custom-opencode');
    vi.stubEnv('OPENCODE_CONFIG_DIR', configDir);
    expect(await setupOpenCodePlugin(client, options())).toMatchObject({
      status: 'installed',
    });
    expect(await setupOpenCodePlugin(client, options())).toMatchObject({
      status: 'up_to_date',
    });
    expect(addCalls()).toHaveLength(1);
  });

  it('keeps a configured plugin without reinstalling it', async () => {
    mockOpenCode();
    await writeConfig(
      configDir,
      'opencode.jsonc',
      `{\n  // personal setup\n  "plugins": [{ "package": "${source}", "options": {} }],\n}\n`
    );
    expect(await setupOpenCodePlugin(client, options())).toEqual({
      status: 'up_to_date',
      message: 'Vercel plugin for OpenCode is installed.',
    });
    expect(addCalls()).toHaveLength(0);
  });

  it('installs the plugin from GitHub and is a no-op on the next run', async () => {
    mockOpenCode();
    expect(await setupOpenCodePlugin(client, options())).toMatchObject({
      status: 'installed',
      message: expect.stringContaining('/mcps'),
    });
    expect(addCalls()).toEqual([
      [
        'opencode',
        ['plugin', 'add', source],
        expect.objectContaining({ stdin: 'ignore' }),
      ],
    ]);
    expect(
      JSON.parse(await readFile(join(configDir, 'opencode.json'), 'utf8'))
    ).toEqual({
      plugins: [source],
    });
    expect(await setupOpenCodePlugin(client, options())).toMatchObject({
      status: 'up_to_date',
    });
    expect(addCalls()).toHaveLength(1);
  });

  it.each([
    [{ dryRun: true }, 'dry_run'],
    [{ yes: false }, 'confirmation_required'],
  ] as const)('does not install for %o', async (overrides, status) => {
    mockOpenCode();
    expect(await setupOpenCodePlugin(client, options(overrides))).toMatchObject(
      { status }
    );
    expect(addCalls()).toHaveLength(0);
  });

  it('respects a declined prompt', async () => {
    mockOpenCode();
    vi.spyOn(client.input, 'confirm').mockResolvedValue(false);
    expect(
      await setupOpenCodePlugin(
        client,
        options({ yes: false, canPrompt: true })
      )
    ).toMatchObject({ status: 'declined' });
    expect(addCalls()).toHaveLength(0);
  });

  it('reports a failed install with the manual command', async () => {
    mockOpenCode({ addFails: true });
    expect(await setupOpenCodePlugin(client, options())).toEqual({
      status: 'failed',
      message: `Failed to install the Vercel plugin for OpenCode. Run \`opencode plugin add ${source}\` to finish setup.`,
    });
  });
});
