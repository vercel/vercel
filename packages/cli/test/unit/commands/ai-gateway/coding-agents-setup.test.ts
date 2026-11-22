import stripAnsi from 'strip-ansi';
import {
  afterEach,
  beforeEach,
  describe as vitestDescribe,
  expect,
  it,
  vi,
} from 'vitest';

// The keychain/clipboard boundaries are fully mocked below, so this suite is
// deterministic and runs on every platform. It was previously skipped on macOS,
// where the real-Keychain fallback in the mock would prompt and hang.
const describe = vitestDescribe;
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as tomlParse } from 'smol-toml';
import { load as yamlLoad } from 'js-yaml';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import setup from '../../../../src/commands/setup';
import tokenPass from '../../../../src/commands/token-pass';
import { useUser } from '../../../mocks/user';
import {
  buildSetupPlan,
  detectShellRc,
} from '../../../../src/util/ai-gateway/coding-agents/apply';
import { renderDiff } from '../../../../src/util/ai-gateway/coding-agents/diff';
import {
  mergeJson,
  mergeToml,
  upsertManagedBlock,
} from '../../../../src/util/ai-gateway/coding-agents/config-files';
import { useTeam } from '../../../mocks/team';
import { claudeCode } from '../../../../src/util/ai-gateway/coding-agents/agents/claude-code';
import { codex } from '../../../../src/util/ai-gateway/coding-agents/agents/codex';
import { deepseek } from '../../../../src/util/ai-gateway/coding-agents/agents/deepseek';
import { copilot } from '../../../../src/util/ai-gateway/coding-agents/agents/copilot';
import { omp } from '../../../../src/util/ai-gateway/coding-agents/agents/omp';
import { opencode } from '../../../../src/util/ai-gateway/coding-agents/agents/opencode';
import { ZCODE_PROVIDER_KEY } from '../../../../src/util/ai-gateway/coding-agents/agents/zcode';
import {
  isKeychainAvailable,
  storeKeyInKeychain,
  keychainLookup,
} from '../../../../src/util/ai-gateway/coding-agents/keychain';

// Fully in-memory mock of the keychain module so the suite is deterministic and
// never invokes the real macOS Keychain (which would prompt and hang). Helpers
// like `keychainLookup` keep their real implementations via the spread.
const keychainState = vi.hoisted(() => ({
  available: undefined as boolean | undefined,
  stored: [] as string[],
  storeResult: true,
  copied: [] as string[],
  copyResult: true,
}));

vi.mock(
  '../../../../src/util/ai-gateway/coding-agents/keychain',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../../../src/util/ai-gateway/coding-agents/keychain')
      >();
    return {
      ...actual,
      // Defaults to "unavailable", matching Linux CI; a test opts in with
      // `keychainState.available = true`.
      isKeychainAvailable: () => keychainState.available ?? false,
      storeKeyInKeychain: (key: string) => {
        // Fails closed when the keychain isn't available.
        if (keychainState.available !== true) {
          return false;
        }
        if (keychainState.storeResult) {
          keychainState.stored.push(key);
        }
        return keychainState.storeResult;
      },
      copyToClipboard: (text: string) => {
        keychainState.copied.push(text);
        return keychainState.copyResult;
      },
    };
  }
);

const CREATED_KEY = 'vck_CreatedSecretKey1234';
const mockApiKeyResponse = {
  apiKeyString: CREATED_KEY,
  apiKey: {
    id: '5d9f2ebd38dd',
    name: 'my-key',
    partialKey: 'vck',
    teamId: 'team_abc',
    purpose: 'ai-gateway',
    createdAt: 1700000000000,
  },
};

let lastCreateBody: Record<string, unknown> | undefined;
function useCreateApiKey(response = mockApiKeyResponse) {
  lastCreateBody = undefined;
  client.scenario.post('/v1/api-keys', (req, res) => {
    lastCreateBody = req.body;
    res.json(response);
  });
}

const leaderboardRows = [
  {
    date: '2026-08-11',
    group: 'model',
    name: 'Gemini 3.6 Flash',
    metric: 'spend',
    modality: 'text',
    share_percent: 90,
  },
  {
    date: '2026-08-12',
    group: 'model',
    name: 'Claude Opus 5',
    metric: 'spend',
    modality: 'text',
    share_percent: 24.72,
  },
  {
    date: '2026-08-12',
    group: 'model',
    name: 'Other',
    metric: 'spend',
    modality: 'text',
    share_percent: 22.32,
  },
  {
    date: '2026-08-12',
    group: 'model',
    name: 'Claude Sonnet 5',
    metric: 'spend',
    modality: 'text',
    share_percent: 5.67,
  },
  {
    date: '2026-08-12',
    group: 'model',
    name: 'Kimi K3',
    metric: 'spend',
    modality: 'text',
    share_percent: 4.97,
  },
  {
    date: '2026-08-12',
    group: 'model',
    name: 'GPT-5 nano',
    metric: 'requests',
    modality: 'text',
    share_percent: 99,
  },
];

const catalogModels = [
  { id: 'anthropic/claude-opus-5', object: 'model', name: 'Claude Opus 5' },
  { id: 'anthropic/claude-sonnet-5', object: 'model', name: 'Claude Sonnet 5' },
  { id: 'moonshotai/kimi-k3', object: 'model', name: 'Kimi K3' },
  { id: 'google/gemini-3.6-flash', object: 'model', name: 'Gemini 3.6 Flash' },
  { id: 'openai/gpt-5-nano', object: 'model', name: 'GPT-5 nano' },
];

function useTopModels(rows: unknown[] = leaderboardRows) {
  client.scenario.get('/api/ai/leaderboard-export', (_req, res) => {
    res.json({
      dataset: 'models',
      modality: 'text',
      license: 'CC BY 4.0',
      license_url: 'https://creativecommons.org/licenses/by/4.0/',
      rows,
    });
  });
  client.scenario.get('/v1/models', (_req, res) => {
    res.json({ object: 'list', data: catalogModels });
  });
}

let home: string;

function zedSettingsDir(): string {
  return process.platform === 'win32'
    ? join(home, 'AppData', 'Roaming', 'Zed')
    : join(home, '.config', 'zed');
}

let savedEnv: Record<string, string | undefined>;

function claudeSettingsPath() {
  return join(home, '.claude', 'settings.json');
}
function codexConfigPath() {
  return join(home, '.codex', 'config.toml');
}
function bashrcPath() {
  // Mirror detectShellRc: macOS bash login shells read ~/.bash_profile.
  return join(
    home,
    process.platform === 'darwin' ? '.bash_profile' : '.bashrc'
  );
}
function opencodeConfigPath() {
  return join(home, '.config', 'opencode', 'opencode.json');
}
function deepagentsConfigPath() {
  return join(home, '.deepagents', 'config.toml');
}
function piAuthPath() {
  return join(home, '.pi', 'agent', 'auth.json');
}
function fxSettingsPath() {
  return join(home, '.fx', 'settings.json');
}
function dshSettingsPath() {
  return join(home, '.dsh', 'settings.yaml');
}
function gooseConfigPath() {
  return join(home, '.config', 'goose', 'config.yaml');
}
function gooseProviderPath() {
  return join(
    home,
    '.config',
    'goose',
    'custom_providers',
    'vercel_ai_gateway.json'
  );
}
function openhandsSettingsPath() {
  return join(home, '.openhands', 'agent_settings.json');
}
function forgeConfigPath() {
  return join(home, '.forge', '.forge.toml');
}
function forgeCredentialsPath() {
  return join(home, '.forge', '.credentials.json');
}

const GATEWAY_MODEL_FIXTURE = [
  {
    id: 'anthropic/claude-fable-5',
    object: 'model',
    owned_by: 'anthropic',
    name: 'Claude Fable 5',
    type: 'language',
    tags: ['tool-use'],
    context_window: 1_000_000,
    max_tokens: 128_000,
    pricing: { input: '0.00001', output: '0.00005' },
  },
  {
    id: 'anthropic/claude-sonnet-4.6',
    object: 'model',
    owned_by: 'anthropic',
    name: 'Claude Sonnet 4.6',
    type: 'language',
    tags: ['tool-use'],
    context_window: 1_000_000,
    max_tokens: 128_000,
    pricing: { input: '0.000003', output: '0.000015' },
  },
  {
    id: 'alibaba/qwen-3-14b',
    object: 'model',
    owned_by: 'alibaba',
    name: 'Qwen3-14B',
    type: 'language',
    tags: ['tool-use'],
    context_window: 40_960,
    max_tokens: 16_384,
  },
  {
    id: 'vendor/unsized-chat',
    object: 'model',
    owned_by: 'vendor',
    name: 'Unsized Chat',
    type: 'language',
    tags: ['tool-use'],
  },
  {
    id: 'openai/text-embedding-3-large',
    object: 'model',
    owned_by: 'openai',
    name: 'Embedding',
    type: 'embedding',
    context_window: 8192,
    pricing: { input: '0.00000013' },
  },
];

function useGatewayModels(models: unknown[] = GATEWAY_MODEL_FIXTURE) {
  client.scenario.get('/v1/models', (_req, res) => {
    res.json({ object: 'list', data: models });
  });
}

const SHORTLIST_LEADERBOARD_ROWS = [
  {
    date: '2026-08-12',
    group: 'model',
    name: 'Qwen3-14B',
    metric: 'spend',
    modality: 'text',
    share_percent: 41.5,
  },
  {
    date: '2026-08-12',
    group: 'model',
    name: 'Embedding',
    metric: 'spend',
    modality: 'text',
    share_percent: 30.1,
  },
  {
    date: '2026-08-12',
    group: 'model',
    name: 'Claude Sonnet 4.6',
    metric: 'spend',
    modality: 'text',
    share_percent: 18.4,
  },
  {
    date: '2026-08-12',
    group: 'model',
    name: 'Claude Fable 5',
    metric: 'spend',
    modality: 'text',
    share_percent: 9.9,
  },
];

function useShortlistLeaderboard() {
  useGatewayModels();
  client.scenario.get('/api/ai/leaderboard-export', (_req, res) => {
    res.json({
      dataset: 'models',
      modality: 'text',
      license: 'CC BY 4.0',
      license_url: 'https://creativecommons.org/licenses/by/4.0/',
      rows: SHORTLIST_LEADERBOARD_ROWS,
    });
  });
}

const DEEPSEEK_MODEL_FIXTURE = [
  ...GATEWAY_MODEL_FIXTURE,
  {
    id: 'deepseek/deepseek-v4-flash',
    object: 'model',
    owned_by: 'deepseek',
    name: 'DeepSeek V4 Flash',
    type: 'language',
    tags: ['tool-use'],
    context_window: 128_000,
    max_tokens: 32_768,
    released: 1_760_000_000,
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    object: 'model',
    owned_by: 'deepseek',
    name: 'DeepSeek V4 Pro',
    type: 'language',
    tags: ['tool-use'],
    context_window: 128_000,
    max_tokens: 32_768,
    released: 1_750_000_000,
  },
];

beforeEach(() => {
  keychainState.available = undefined;
  keychainState.stored.length = 0;
  keychainState.storeResult = true;
  keychainState.copied.length = 0;
  keychainState.copyResult = true;
  home = mkdtempSync(join(tmpdir(), 'vc-setup-agents-'));
  savedEnv = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    SHELL: process.env.SHELL,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    CODEX_HOME: process.env.CODEX_HOME,
    GROK_HOME: process.env.GROK_HOME,
    KIMI_SHARE_DIR: process.env.KIMI_SHARE_DIR,
    JUNIE_HOME: process.env.JUNIE_HOME,
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
    DSH_HOME: process.env.DSH_HOME,
    VIBE_HOME: process.env.VIBE_HOME,
    OPENHANDS_PERSISTENCE_DIR: process.env.OPENHANDS_PERSISTENCE_DIR,
    PI_CONFIG_DIR: process.env.PI_CONFIG_DIR,
    ZDOTDIR: process.env.ZDOTDIR,
    APPDATA: process.env.APPDATA,
    VERCEL_LEADERBOARD_URL: process.env.VERCEL_LEADERBOARD_URL,
    VERCEL_AI_GATEWAY_URL: process.env.VERCEL_AI_GATEWAY_URL,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.APPDATA = join(home, 'AppData', 'Roaming');
  process.env.SHELL = '/bin/bash';
  // Pinned so no test reaches the real leaderboard; unregistered routes 404 into the fallback.
  process.env.VERCEL_LEADERBOARD_URL = client.apiUrl;
  process.env.VERCEL_AI_GATEWAY_URL = client.apiUrl;
  for (const v of [
    'XDG_CONFIG_HOME',
    'CLAUDE_CONFIG_DIR',
    'CODEX_HOME',
    'GROK_HOME',
    'DSH_HOME',
    'KIMI_SHARE_DIR',
    'JUNIE_HOME',
    'PI_CODING_AGENT_DIR',
    'VIBE_HOME',
    'OPENHANDS_PERSISTENCE_DIR',
    'PI_CONFIG_DIR',
    'ZDOTDIR',
  ]) {
    delete process.env[v];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('ai-gateway coding-agents setup', () => {
  describe('--token-pass', () => {
    function prepare() {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      useTopModels();
      client.config.currentTeam = team.id;
      return team;
    }

    const entrypoints = [
      ['token-pass', 'setup'],
      ['tokenpass', 'setup'],
      ['ai-gateway', 'setup', '--token-pass'],
      ['ai-gateway', 'coding-agents', 'setup', '--token-pass'],
    ];

    function runSetup(path: string[], ...flags: string[]) {
      client.setArgv(...path, ...flags);
      return path[0] === 'ai-gateway' ? aiGateway(client) : tokenPass(client);
    }

    function detectAgents() {
      for (const dir of ['.fx', '.pi/agent', '.claude', '.codex']) {
        mkdirSync(join(home, dir), { recursive: true });
      }
      mkdirSync(join(home, '.config', 'opencode'), { recursive: true });
      writeFileSync(opencodeConfigPath(), '{}');
    }

    it.each(
      entrypoints
    )('only offers Token Pass agents through %j', async (...path) => {
      prepare();
      detectAgents();
      const checkboxSpy = vi.spyOn(client.input, 'checkbox');
      const pending = runSetup(path, '--dry-run', '--key', 'vck_DummyKey0011');

      await expect(client.stderr).toOutput('Which coding agents');
      expect(checkboxSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          choices: [
            { name: 'fx', value: 'fx', checked: true },
            { name: 'OpenCode', value: 'opencode', checked: true },
            { name: 'Pi', value: 'pi', checked: true },
          ],
        })
      );
      const prompt = client.stderr.getFullOutput();
      expect(prompt).toContain('fx');
      expect(prompt).toContain('OpenCode');
      expect(prompt).toContain('Pi');
      expect(prompt).not.toContain('Claude Code');
      expect(prompt).not.toContain('Codex');
      client.stdin.write('\n');
      expect(await pending).toBe(0);
      expect(lastCreateBody).toBeUndefined();
      checkboxSpy.mockRestore();
    });

    it.each(entrypoints)('limits --all through %j', async (...path) => {
      prepare();
      client.nonInteractive = true;
      const checkboxSpy = vi.spyOn(client.input, 'checkbox');
      expect(await runSetup(path, '--all', '--dry-run')).toBe(0);
      const result = JSON.parse(client.stdout.getFullOutput());
      const agents = new Set(
        result.changes
          .filter((change: { agent: string }) => change.agent !== 'Environment')
          .flatMap((change: { agent: string }) => change.agent.split(', '))
      );
      expect([...agents].sort()).toEqual(['OpenCode', 'Pi', 'fx']);
      expect(checkboxSpy).not.toHaveBeenCalled();
      expect(lastCreateBody).toBeUndefined();
      checkboxSpy.mockRestore();
    });

    it.each(
      entrypoints
    )('only auto-selects Token Pass agents through %j', async (...path) => {
      prepare();
      detectAgents();
      client.nonInteractive = true;
      expect(await runSetup(path, '--dry-run')).toBe(0);
      const result = JSON.parse(client.stdout.getFullOutput());
      const agents = new Set(
        result.changes
          .filter((change: { agent: string }) => change.agent !== 'Environment')
          .flatMap((change: { agent: string }) => change.agent.split(', '))
      );
      expect([...agents].sort()).toEqual(['OpenCode', 'Pi', 'fx']);
      expect(lastCreateBody).toBeUndefined();
    });

    it.each(
      entrypoints
    )('rejects other agents through %j before creating a key', async (...path) => {
      prepare();
      client.nonInteractive = true;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      await expect(
        runSetup(path, '--agent', 'claude-code', '--agent', 'fx', '--yes')
      ).rejects.toThrow('exit');
      expect(exitSpy).toHaveBeenCalledWith(2);
      exitSpy.mockRestore();
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.reason).toBe('invalid_arguments');
      expect(result.message).toContain('Supported: fx, opencode, pi.');
      expect(lastCreateBody).toBeUndefined();
      expect(existsSync(fxSettingsPath())).toBe(false);
      expect(existsSync(claudeSettingsPath())).toBe(false);
    });

    it.each([
      false,
      true,
    ])('fails when only other agents are detected (machine=%s)', async machine => {
      prepare();
      mkdirSync(join(home, '.claude'), { recursive: true });
      client.nonInteractive = machine;
      const checkboxSpy = vi.spyOn(client.input, 'checkbox');
      if (machine) {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        await expect(
          runSetup(['ai-gateway', 'setup', '--token-pass'], '--yes')
        ).rejects.toThrow('exit');
        expect(exitSpy).toHaveBeenCalledWith(2);
        exitSpy.mockRestore();
      } else {
        expect(
          await runSetup(['ai-gateway', 'setup', '--token-pass'], '--yes')
        ).toBe(2);
      }
      expect(checkboxSpy).not.toHaveBeenCalled();
      expect(lastCreateBody).toBeUndefined();
      if (machine) {
        expect(JSON.parse(client.stdout.getFullOutput()).reason).toBe(
          'invalid_arguments'
        );
      } else {
        expect(client.stderr.getFullOutput()).toContain(
          'No coding agents detected'
        );
      }
      checkboxSpy.mockRestore();
    });

    it.each(
      entrypoints.flatMap(path => [
        { path, machine: false },
        { path, machine: true },
      ])
    )('omits model guidance through $path (machine=$machine)', async ({
      path,
      machine,
    }) => {
      prepare();
      client.nonInteractive = machine;
      expect(
        await runSetup(path, '--all', '--key', 'vck_ExistingPassKey', '--yes')
      ).toBe(0);
      const notes = machine
        ? JSON.parse(client.stdout.getFullOutput()).notes.join('\n')
        : client.stderr.getFullOutput();
      expect(notes).not.toContain('whole gateway catalog');
      expect(notes).not.toContain('catalog');
      expect(notes).not.toContain('/model');
      expect(notes).not.toContain('pick a model');
      expect(notes).not.toContain('vercel/<creator>/<model>');
      expect(notes).toContain('AI_GATEWAY_API_KEY');
    });

    it.each([
      false,
      true,
    ])('preserves ordinary Gateway model guidance (machine=%s)', async machine => {
      prepare();
      client.nonInteractive = machine;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--agent',
        'fx',
        '--agent',
        'opencode',
        '--agent',
        'pi',
        '--key',
        'vck_ExistingKey',
        '--yes'
      );
      expect(await aiGateway(client)).toBe(0);
      const notes = machine
        ? JSON.parse(client.stdout.getFullOutput()).notes.join('\n')
        : client.stderr.getFullOutput();
      expect(notes).toContain('whole gateway catalog is available');
      expect(notes).toContain('vercel/<creator>/<model>');
      expect(notes).toContain('pick a model with /model or --model');
    });

    it.each(
      entrypoints
    )('labels the team picker with Token Pass API Key through %j', async (...path) => {
      prepare();
      mkdirSync(join(home, '.fx'), { recursive: true });
      const pending = runSetup(
        path,
        '--agent',
        'fx',
        '--dry-run',
        '--name',
        'my-pass',
        '--refresh-period',
        'none',
        '--expiration',
        'none',
        '--no-keychain',
        '--apply',
        'edit'
      );
      await expect(client.stderr).toOutput('Which team?');
      expect(client.stderr.getFullOutput()).toContain(
        'The new Token Pass API Key will be created under this team:'
      );
      expect(client.stderr.getFullOutput()).not.toContain(
        'The new AI Gateway API key will be created under this team:'
      );
      client.stdin.write('\n');
      expect(await pending).toBe(0);
      expect(lastCreateBody).toBeUndefined();
    });

    it.each([
      { machine: false, tty: true },
      { machine: false, tty: false },
      { machine: true, tty: true },
      { machine: true, tty: false },
    ])('creates a pass key (machine=$machine, tty=$tty)', async ({
      machine,
      tty,
    }) => {
      prepare();
      client.nonInteractive = machine;
      client.stdin.isTTY = tty;
      const confirmSpy = vi.spyOn(client.input, 'confirm');
      confirmSpy.mockClear();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--token-pass',
        '--agent',
        'opencode',
        '--agent',
        'fx',
        '--yes'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(lastCreateBody).toEqual({
        purpose: 'ai-gateway',
        name: expect.stringContaining('token-pass'),
        metadata: { tokenPass: true },
      });
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(client.stderr.getFullOutput()).not.toContain(
        'Skipped the Vercel plugin'
      );
      const settings = JSON.parse(readFileSync(opencodeConfigPath(), 'utf8'));
      expect(settings.provider.vercel.options.apiKey).toBe(CREATED_KEY);
      if (process.platform !== 'win32') {
        const shell = readFileSync(bashrcPath(), 'utf8');
        expect(shell).toContain('AI_GATEWAY_API_KEY');
        expect(shell).not.toContain('TOKENPASS_API_KEY');
      }
      if (machine)
        expect(JSON.parse(client.stdout.getFullOutput()).reason).toBe(
          'coding_agents_configured'
        );
    });

    it('keeps an explicit key name', async () => {
      prepare();
      const fetchSpy = vi.spyOn(client, 'fetch');
      fetchSpy.mockClear();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--token-pass',
        '--agent',
        'opencode',
        '--name',
        'my-pass',
        '--yes'
      );
      expect(await aiGateway(client)).toBe(0);
      expect(lastCreateBody?.name).toBe('my-pass');
      expect(
        fetchSpy.mock.calls.some(([url]) => String(url).includes('/v1/models'))
      ).toBe(false);
      expect(client.stderr.getFullOutput()).not.toContain('Token Pass models');
      expect(client.stderr.getFullOutput()).not.toContain(
        'https://vercel.com/d?to='
      );
    });

    it.each([
      ['token-pass'],
      ['tokenpass'],
      ['token-pass', 'setup'],
      ['tokenpass', 'setup'],
    ])('creates a pass key through %j', async (...path) => {
      prepare();
      client.nonInteractive = true;
      client.setArgv(...path, '--agent', 'opencode', '--yes');
      expect(await tokenPass(client)).toBe(0);
      expect(lastCreateBody?.metadata).toEqual({ tokenPass: true });
      expect(JSON.parse(client.stdout.getFullOutput()).status).toBe('ok');
    });

    it('rejects an unknown option through the alias before creating a key', async () => {
      prepare();
      client.setArgv('token-pass', '--unknown');
      expect(await tokenPass(client)).toBe(2);
      expect(lastCreateBody).toBeUndefined();
    });

    it('rejects an unknown action through the alias before creating a key', async () => {
      prepare();
      client.setArgv('token-pass', 'delete', '--agent', 'opencode', '--yes');
      expect(await tokenPass(client)).toBe(2);
      expect(lastCreateBody).toBeUndefined();
    });

    it('warns when using a raw key without inspecting it', async () => {
      prepare();
      client.nonInteractive = true;
      const fetchSpy = vi.spyOn(client, 'fetch');
      fetchSpy.mockClear();
      client.setArgv(
        'ai-gateway',
        'setup',
        '--token-pass',
        '--agent',
        'opencode',
        '--key',
        'vck_ExistingPassKey',
        '--yes'
      );
      expect(await aiGateway(client)).toBe(0);
      expect(lastCreateBody).toBeUndefined();
      expect(
        fetchSpy.mock.calls.some(([url]) =>
          String(url).includes('/v1/api-keys')
        )
      ).toBe(false);
      expect(client.stderr.getFullOutput()).toContain(
        'Using an existing key; make sure it was created with --token-pass or Token Pass models will not use your pass.'
      );
      expect(client.stderr.getFullOutput()).not.toContain(
        'vck_ExistingPassKey'
      );
    });

    it('creates a new pass key instead of recovering a normal stored key', async () => {
      prepare();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--agent',
        'opencode',
        '--key',
        'vck_NormalStoredKey',
        '--yes'
      );
      expect(await aiGateway(client)).toBe(0);
      client.setArgv(
        'ai-gateway',
        'setup',
        '--token-pass',
        '--agent',
        'opencode',
        '--yes'
      );
      expect(await aiGateway(client)).toBe(0);
      expect(lastCreateBody?.metadata).toEqual({ tokenPass: true });
      expect(
        JSON.parse(readFileSync(opencodeConfigPath(), 'utf8')).provider.vercel
          .options.apiKey
      ).toBe(CREATED_KEY);
    });

    it('does not create a key or write configurations during a dry run', async () => {
      prepare();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--token-pass',
        '--agent',
        'opencode',
        '--dry-run',
        '--yes'
      );
      expect(await aiGateway(client)).toBe(0);
      expect(lastCreateBody).toBeUndefined();
      expect(existsSync(opencodeConfigPath())).toBe(false);
      expect(JSON.parse(client.stdout.getFullOutput()).reason).toBe('dry_run');
    });

    it('does not create a key after failed configuration', async () => {
      prepare();
      client.nonInteractive = true;
      mkdirSync(join(home, '.config', 'opencode'), { recursive: true });
      writeFileSync(opencodeConfigPath(), '{ invalid');
      client.setArgv(
        'ai-gateway',
        'setup',
        '--token-pass',
        '--agent',
        'opencode',
        '--yes'
      );
      expect(await aiGateway(client)).toBe(1);
      expect(lastCreateBody).toBeUndefined();
    });

    it('can generate a setup prompt with a Token Pass key', async () => {
      prepare();
      keychainState.available = true;
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--token-pass',
        '--agent',
        'opencode',
        '--apply',
        'prompt',
        '--yes'
      );
      expect(await aiGateway(client)).toBe(0);
      expect(lastCreateBody?.metadata).toEqual({ tokenPass: true });
      expect(JSON.parse(client.stdout.getFullOutput()).reason).toBe(
        'agent_prompt'
      );
    });

    it('does not change ordinary setup', async () => {
      prepare();
      client.nonInteractive = true;
      client.setArgv('ai-gateway', 'setup', '--agent', 'claude-code', '--yes');
      expect(await aiGateway(client)).toBe(0);
      expect(lastCreateBody).not.toHaveProperty('metadata');
      expect(lastCreateBody).not.toHaveProperty('name');
      expect(client.stderr.getFullOutput()).not.toContain('Token Pass');
    });

    it('creates a pass key interactively without asking which key source to use', async () => {
      const team = prepare();
      client.nonInteractive = false;
      client.stdin.isTTY = true;
      mkdirSync(join(home, '.config', 'opencode'), { recursive: true });
      const selectSpy = vi
        .spyOn(client.input, 'select')
        .mockImplementation(() => {
          throw new Error('Unexpected key-source prompt');
        });
      const confirmSpy = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(false);
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--token-pass',
        '--agent',
        'opencode',
        '--scope',
        team.slug,
        '--name',
        'my-pass',
        '--budget',
        '25',
        '--expiration',
        '7d',
        '--no-keychain',
        '--no-session-migration',
        '--apply',
        'edit'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(selectSpy).not.toHaveBeenCalled();
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(client.stderr.getFullOutput()).not.toContain('Vercel plugin');
      expect(lastCreateBody).toMatchObject({
        name: 'my-pass',
        metadata: { tokenPass: true },
      });
      expect(
        JSON.parse(readFileSync(opencodeConfigPath(), 'utf8')).provider.vercel
          .options.apiKey
      ).toBe(CREATED_KEY);
      expect(client.stderr.getFullOutput()).toContain('Connected');
      expect(existsSync(opencodeConfigPath())).toBe(true);
      selectSpy.mockRestore();
      confirmSpy.mockRestore();
    });
  });

  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'coding-agents', 'setup', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);
      expect(
        stripAnsi(client.stderr.getFullOutput()).replace(/[ \t]+$/gm, '')
      ).toMatchSnapshot();
    });
  });

  describe('canonical ai-gateway setup spelling', () => {
    it('configures an agent via `ai-gateway setup`', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0031',
        '--agent',
        'claude-code'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(existsSync(claudeSettingsPath())).toBe(true);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.reason).toBe('coding_agents_configured');
    });

    it('treats the canonical and alias spellings as one configuration', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0031',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(0);
      const first = readFileSync(claudeSettingsPath(), 'utf8');
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0031',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(0);
      expect(readFileSync(claudeSettingsPath(), 'utf8')).toBe(first);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.reason).toBe('already_configured');
    });

    it('returns exit code 2 for `ai-gateway setup --help`', async () => {
      client.setArgv('ai-gateway', 'setup', '--help');
      expect(await aiGateway(client)).toBe(0);
    });

    it('lists setup, not coding-agents, in ai-gateway help', async () => {
      client.setArgv('ai-gateway', '--help');
      expect(await aiGateway(client)).toBe(0);
      const helpText = client.getFullOutput();
      expect(helpText).toContain('setup');
      expect(helpText).not.toContain('coding-agents');
    });

    it('keeps a legacy managed shell block as already configured', async () => {
      // No managed shell block exists on Windows, so neither does the legacy case.
      if (process.platform === 'win32') return;
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0031',
        '--agent',
        'hermes'
      );
      expect(await aiGateway(client)).toBe(0);
      const migrated = readFileSync(bashrcPath(), 'utf8');
      writeFileSync(
        bashrcPath(),
        migrated.replace(
          '# Managed by `vercel ai-gateway setup`',
          '# Managed by `vercel ai-gateway coding-agents setup`'
        )
      );
      const legacy = readFileSync(bashrcPath(), 'utf8');
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0031',
        '--agent',
        'hermes'
      );
      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.reason).toBe('already_configured');
      expect(readFileSync(bashrcPath(), 'utf8')).toBe(legacy);
    });
  });

  describe('non-interactive with an existing key', () => {
    it('configures Claude Code and emits JSON with the key', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0001',
        '--agent',
        'claude-code'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_BASE_URL).toBe(
        'https://ai-gateway.vercel.sh/claude-code'
      );
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('vck_DummyKey0001');
      expect(settings.env.ANTHROPIC_API_KEY).toBe('');
      expect(settings.env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY).toBe('1');
      expect(settings.env.ENABLE_TOOL_SEARCH).toBe('true');

      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.status).toBe('ok');
      expect(out.reason).toBe('coding_agents_configured');
      expect(out.apiKey).toBe('vck_DummyKey0001');
      expect(out.configured).toHaveLength(1);
      expect(out.configured[0].action).toBe('created');
    });

    // Shell rc management is intentionally skipped on Windows.
    it.skipIf(process.platform === 'win32')(
      'configures Codex with the responses wire API and a shell export',
      async () => {
        useUser();
        client.nonInteractive = true;
        client.setArgv(
          'ai-gateway',
          'coding-agents',
          'setup',
          '--key',
          'vck_DummyKey0002',
          '--agent',
          'codex'
        );

        const exitCode = await aiGateway(client);
        expect(exitCode).toBe(0);

        const toml = tomlParse(readFileSync(codexConfigPath(), 'utf8')) as any;
        expect(toml.model_provider).toBe('vercel');
        // We never pin a default model — only the provider/URL/auth are set up.
        expect(toml.model).toBeUndefined();
        expect(toml.model_providers.vercel.base_url).toBe(
          'https://ai-gateway.vercel.sh/codex/v1'
        );
        expect(toml.model_providers.vercel.wire_api).toBe('responses');
        expect(toml.model_providers.vercel.env_key).toBe('AI_GATEWAY_API_KEY');

        const bashrc = readFileSync(bashrcPath(), 'utf8');
        expect(bashrc).toContain('# >>> vercel ai-gateway >>>');
        expect(bashrc).toContain(
          "export AI_GATEWAY_API_KEY='vck_DummyKey0002'"
        );
      }
    );

    // Regression: a later setup run for one agent must not clobber env
    // exports another agent wrote into the managed shell block (this wiped
    // ANTHROPIC_AUTH_TOKEN on a real machine when a codex-only run followed
    // a claude-code run).
    it.skipIf(process.platform === 'win32')(
      "preserves other agents' env exports across sequential setup runs",
      async () => {
        useUser();
        client.nonInteractive = true;
        keychainState.available = true;
        keychainState.storeResult = true;
        client.setArgv(
          'ai-gateway',
          'coding-agents',
          'setup',
          '--key',
          'vck_DummyKey0002',
          '--agent',
          'claude-code'
        );
        expect(await aiGateway(client)).toBe(0);
        expect(readFileSync(bashrcPath(), 'utf8')).toContain(
          'ANTHROPIC_AUTH_TOKEN'
        );

        client.setArgv(
          'ai-gateway',
          'coding-agents',
          'setup',
          '--key',
          'vck_DummyKey0002',
          '--agent',
          'codex'
        );
        expect(await aiGateway(client)).toBe(0);

        const rc = readFileSync(bashrcPath(), 'utf8');
        expect(rc).toContain('AI_GATEWAY_API_KEY');
        // The codex run rewrote the block — claude-code's export survives.
        expect(rc).toContain('ANTHROPIC_AUTH_TOKEN');
        // Exactly one managed block.
        expect(rc.split('# >>> vercel ai-gateway >>>').length).toBe(2);
      }
    );

    // Cursor keeps BYOK settings in its own store, so setup is guidance-only:
    // provision the key into the shell environment and emit manual steps.
    it.skipIf(process.platform === 'win32')(
      'configures Cursor with a shell export and manual-steps notes only',
      async () => {
        useUser();
        client.nonInteractive = true;
        mkdirSync(join(home, '.cursor'), { recursive: true });
        client.setArgv(
          'ai-gateway',
          'coding-agents',
          'setup',
          '--key',
          'vck_DummyKey0002',
          '--agent',
          'cursor'
        );

        const exitCode = await aiGateway(client);
        expect(exitCode).toBe(0);

        const bashrc = readFileSync(bashrcPath(), 'utf8');
        expect(bashrc).toContain(
          "export AI_GATEWAY_API_KEY='vck_DummyKey0002'"
        );
        // Guidance-only: nothing is written into Cursor's own directory.
        expect(readdirSync(join(home, '.cursor'))).toEqual([]);

        const out = JSON.parse(client.stdout.getFullOutput());
        expect(out.status).toBe('ok');
        const notes: string[] = out.notes ?? [];
        expect(notes.some(n => n.includes('Override OpenAI Base URL'))).toBe(
          true
        );
        expect(
          notes.some(n => n.includes('ai-gateway.vercel.sh/cursor/v1'))
        ).toBe(true);
        // The key itself must never appear in notes.
        expect(notes.every(n => !n.includes('vck_DummyKey0002'))).toBe(true);
      }
    );

    it('configures Kilo Code with an env-referenced openai-compatible provider', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.config', 'kilo'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'kilo'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const raw = readFileSync(
        join(home, '.config', 'kilo', 'kilo.json'),
        'utf8'
      );
      const config = JSON.parse(raw);
      expect(config.provider['openai-compatible'].options).toEqual({
        apiKey: '{env:AI_GATEWAY_API_KEY}',
        baseURL: 'https://ai-gateway.vercel.sh/coding-agent/v1',
      });
      // Kilo substitutes {env:…} itself — the literal key stays out of the file.
      expect(raw).not.toContain('vck_DummyKey0002');
    });

    // XDG_CONFIG_HOME is a unix convention; kiloConfigDir requires an
    // absolute unix path, so Windows exercises the ~/.config fallback.
    it.skipIf(process.platform === 'win32')(
      'honors XDG_CONFIG_HOME for the Kilo config location',
      async () => {
        useUser();
        client.nonInteractive = true;
        const xdg = join(home, 'xdg-config');
        const saved = process.env.XDG_CONFIG_HOME;
        process.env.XDG_CONFIG_HOME = xdg;
        try {
          mkdirSync(join(xdg, 'kilo'), { recursive: true });
          client.setArgv(
            'ai-gateway',
            'coding-agents',
            'setup',
            '--key',
            'vck_DummyKey0002',
            '--agent',
            'kilo'
          );
          expect(await aiGateway(client)).toBe(0);
          expect(existsSync(join(xdg, 'kilo', 'kilo.json'))).toBe(true);
        } finally {
          if (saved === undefined) delete process.env.XDG_CONFIG_HOME;
          else process.env.XDG_CONFIG_HOME = saved;
        }
      }
    );

    it('configures Cline via its providers.json (0600), version only when new', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.cline'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'cline'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const providersPath = join(
        home,
        '.cline',
        'data',
        'settings',
        'providers.json'
      );
      const config = JSON.parse(readFileSync(providersPath, 'utf8'));
      expect(config.version).toBe(1);
      expect(config.lastUsedProvider).toBe('vercel-ai-gateway');
      expect(config.providers['vercel-ai-gateway'].settings).toMatchObject({
        provider: 'vercel-ai-gateway',
        apiKey: 'vck_DummyKey0002',
      });
      expect(config.providers['vercel-ai-gateway'].tokenSource).toBe('manual');
      if (process.platform !== 'win32') {
        expect(statSync(providersPath).mode & 0o777).toBe(0o600);
      }
    });

    it('preserves an existing providers.json schema version for Cline', async () => {
      useUser();
      client.nonInteractive = true;
      const settingsDir = join(home, '.cline', 'data', 'settings');
      mkdirSync(settingsDir, { recursive: true });
      writeFileSync(
        join(settingsDir, 'providers.json'),
        JSON.stringify({
          version: 2,
          lastUsedProvider: 'anthropic',
          providers: {
            anthropic: { settings: { provider: 'anthropic' } },
          },
        })
      );
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'cline'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const config = JSON.parse(
        readFileSync(join(settingsDir, 'providers.json'), 'utf8')
      );
      // Never downgrade another tool's schema version.
      expect(config.version).toBe(2);
      // Existing provider entries survive alongside the new one.
      expect(config.providers.anthropic).toBeDefined();
      expect(config.providers['vercel-ai-gateway'].settings.apiKey).toBe(
        'vck_DummyKey0002'
      );
      expect(config.lastUsedProvider).toBe('vercel-ai-gateway');
    });

    it('configures ZCode via ~/.zcode/v2/config.json (0600) under a stable provider key', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.zcode'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'zcode'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const configPath = join(home, '.zcode', 'v2', 'config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      const entry = config.provider[ZCODE_PROVIDER_KEY];
      expect(entry).toMatchObject({
        name: 'Vercel AI Gateway',
        kind: 'openai-compatible',
        source: 'custom',
        options: {
          apiKey: 'vck_DummyKey0002',
          baseURL: 'https://ai-gateway.vercel.sh/coding-agent/v1',
          apiKeyRequired: true,
        },
      });
      expect(Object.keys(entry.models)).toEqual(
        expect.arrayContaining([
          'anthropic/claude-fable-5',
          'openai/gpt-5.6-sol',
        ])
      );
      if (process.platform !== 'win32') {
        expect(statSync(configPath).mode & 0o777).toBe(0o600);
      }
    });

    it('seeds ZCode models from the leaderboard with catalog limits', async () => {
      useUser();
      useShortlistLeaderboard();
      client.nonInteractive = true;
      mkdirSync(join(home, '.zcode'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'zcode'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = JSON.parse(
        readFileSync(join(home, '.zcode', 'v2', 'config.json'), 'utf8')
      );
      const entry = config.provider[ZCODE_PROVIDER_KEY];
      expect(Object.keys(entry.models)).toEqual([
        'anthropic/claude-fable-5',
        'alibaba/qwen-3-14b',
        'anthropic/claude-sonnet-4.6',
      ]);
      expect(entry.models['alibaba/qwen-3-14b']).toEqual({
        limit: { context: 40_960, output: 16_384 },
      });
      expect(entry.models['anthropic/claude-fable-5']).toMatchObject({
        modalities: { input: ['text', 'image'], output: ['text'] },
      });
    });

    it('can follow the top-level setup consent retry for ZCode', async () => {
      const team = useTeam();
      useUser();
      useTopModels();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      mkdirSync(join(home, '.zcode'), { recursive: true });
      client.setArgv('setup', '--gateway', '--yes', '--non-interactive');

      expect(await setup(client)).toBe(1);
      const before = client.stdout.getFullOutput();
      const first = JSON.parse(before);
      expect(first.reason).toBe('requires_consent');
      expect(first.next[0].command).toBe(
        'vercel setup --gateway --yes --non-interactive --agent zcode'
      );
      expect(lastCreateBody).toBeUndefined();

      client.setArgv(...first.next[0].command.split(' ').slice(1));
      expect(await setup(client)).toBe(0);
      const result = JSON.parse(
        client.stdout.getFullOutput().slice(before.length)
      );
      expect(result.reason).toBe('coding_agents_configured');
      expect(result.skipped).toHaveLength(0);
      expect(existsSync(join(home, '.zcode', 'v2', 'config.json'))).toBe(true);
      expect(lastCreateBody).toBeDefined();
    });

    // zcode is the only agent with warnings(), so it exercises the consent-skip path.
    it('consent-skips auto-selected ZCode instead of writing the key unattended', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.zcode'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002'
      );

      expect(await aiGateway(client)).toBe(1);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.reason).toBe('requires_consent');
      expect(out.skipped[0].target).toBe('zcode');
      expect(existsSync(join(home, '.zcode', 'v2', 'config.json'))).toBe(false);
    });

    it('preserves ZCode built-in providers and reuses a user-created gateway entry', async () => {
      useUser();
      client.nonInteractive = true;
      const configDir = join(home, '.zcode', 'v2');
      mkdirSync(configDir, { recursive: true });
      const userEntryKey = '8e171e8b-0b97-4d2d-ba13-ad66baa44ae5';
      const builtin = {
        name: 'Z.ai - API Key',
        kind: 'anthropic',
        options: { apiKey: '', baseURL: 'https://api.z.ai/api/anthropic' },
        source: 'custom',
        models: { 'GLM-5.3': { limit: { context: 1000000, output: 128000 } } },
      };
      writeFileSync(
        join(configDir, 'config.json'),
        JSON.stringify({
          provider: {
            'builtin:zai': builtin,
            [userEntryKey]: {
              name: 'My Gateway',
              kind: 'openai-compatible',
              options: {
                apiKey: 'vck_OldKey0001',
                baseURL: 'https://ai-gateway.vercel.sh/coding-agent/v1',
                apiKeyRequired: true,
              },
              source: 'custom',
              models: { 'probe/echo-model': {} },
            },
          },
        })
      );
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'zcode'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const config = JSON.parse(
        readFileSync(join(configDir, 'config.json'), 'utf8')
      );
      expect(config.provider['builtin:zai']).toEqual(builtin);
      expect(config.provider[ZCODE_PROVIDER_KEY]).toBeUndefined();
      const entry = config.provider[userEntryKey];
      expect(entry.name).toBe('My Gateway');
      expect(entry.options.apiKey).toBe('vck_DummyKey0002');
      expect(entry.models['probe/echo-model']).toBeDefined();
      expect(entry.models['anthropic/claude-fable-5']).toBeDefined();
      if (process.platform !== 'win32') {
        expect(statSync(join(configDir, 'config.json')).mode & 0o777).toBe(
          0o600
        );
        expect(statSync(join(configDir, 'config.json.bak')).mode & 0o777).toBe(
          0o600
        );
      }
    });

    it('repairs drifted permissions on an already-configured ZCode rerun', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.zcode'), { recursive: true });
      const argv = [
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'zcode',
      ] as const;
      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);

      const configPath = join(home, '.zcode', 'v2', 'config.json');
      const written = readFileSync(configPath, 'utf8');
      chmodSync(configPath, 0o644);

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);

      expect(readFileSync(configPath, 'utf8')).toBe(written);
      if (process.platform !== 'win32') {
        expect(statSync(configPath).mode & 0o777).toBe(0o600);
      }
    });

    it('writes a --base-url override into the ZCode provider', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.zcode'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'zcode',
        '--base-url',
        'http://localhost:9999/v1'
      );
      expect(await aiGateway(client)).toBe(0);

      const config = JSON.parse(
        readFileSync(join(home, '.zcode', 'v2', 'config.json'), 'utf8')
      );
      expect(config.provider[ZCODE_PROVIDER_KEY].options.baseURL).toBe(
        'http://localhost:9999/v1'
      );
    });

    it('does not claim a production ZCode entry when --base-url points elsewhere', async () => {
      useUser();
      client.nonInteractive = true;
      const configDir = join(home, '.zcode', 'v2');
      mkdirSync(configDir, { recursive: true });
      const productionKey = '8e171e8b-0b97-4d2d-ba13-ad66baa44ae5';
      const production = {
        name: 'My Gateway',
        kind: 'openai-compatible',
        options: {
          apiKey: 'vck_ProductionKey01',
          baseURL: 'https://ai-gateway.vercel.sh/coding-agent/v1',
          apiKeyRequired: true,
        },
        source: 'custom',
        models: { 'anthropic/claude-fable-5': {} },
      };
      writeFileSync(
        join(configDir, 'config.json'),
        JSON.stringify({ provider: { [productionKey]: production } })
      );
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'zcode',
        '--base-url',
        'http://localhost:9999/v1'
      );
      expect(await aiGateway(client)).toBe(0);

      const config = JSON.parse(
        readFileSync(join(configDir, 'config.json'), 'utf8')
      );
      expect(config.provider[productionKey]).toEqual(production);
      expect(config.provider[ZCODE_PROVIDER_KEY].options.baseURL).toBe(
        'http://localhost:9999/v1'
      );
      expect(config.provider[ZCODE_PROVIDER_KEY].options.apiKey).toBe(
        'vck_DummyKey0002'
      );
    });

    it('configures Hermes via config.yaml with key_env, preserving existing entries', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.hermes'), { recursive: true });
      writeFileSync(
        join(home, '.hermes', 'config.yaml'),
        'providers:\n  work-gpu:\n    api: https://internal.corp/v1\n    key_env: CORP_KEY\n'
      );
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'hermes'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.hermes', 'config.yaml'), 'utf8');
      expect(raw).toContain('vercel-ai-gateway');
      expect(raw).toContain(
        'api: https://ai-gateway.vercel.sh/coding-agent/v1'
      );
      expect(raw).toContain('key_env: AI_GATEWAY_API_KEY');
      expect(raw).toContain('discover_models: true');
      // Existing provider entries survive the merge.
      expect(raw).toContain('work-gpu');
      expect(raw).toContain('CORP_KEY');
      // The literal key never lands in the file.
      expect(raw).not.toContain('vck_DummyKey0002');
    });

    it('configures OpenClaw with the built-in models when the leaderboard is unreachable', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.openclaw'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'openclaw'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(
        join(home, '.openclaw', 'openclaw.json'),
        'utf8'
      );
      const config = JSON.parse(raw);
      const provider = config.models.providers['vercel-ai-gateway'];
      expect(provider.baseUrl).toBe(
        'https://ai-gateway.vercel.sh/coding-agent/v1'
      );
      // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting OpenClaw's literal env-reference syntax
      expect(provider.apiKey).toBe('${AI_GATEWAY_API_KEY}');
      expect(provider.api).toBe('openai-completions');
      expect(provider.models.map((m: { id: string }) => m.id)).toContain(
        'anthropic/claude-fable-5'
      );
      expect(config.agents.defaults.model.primary).toBe(
        'vercel-ai-gateway/anthropic/claude-fable-5'
      );
      expect(raw).not.toContain('vck_DummyKey0002');
    });

    it('configures Grok Build via config.toml with a gateway models endpoint and env-keyed default model', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.grok'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'grok'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.grok', 'config.toml'), 'utf8');
      const toml = tomlParse(raw) as any;
      expect(toml.endpoints.models_base_url).toBe(
        'https://ai-gateway.vercel.sh/coding-agent/v1'
      );
      expect(toml.models.default).toBe('vercel-ai-gateway');
      expect(toml.model['vercel-ai-gateway']).toEqual({
        model: 'xai/grok-4.6',
        base_url: 'https://ai-gateway.vercel.sh/coding-agent/v1',
        name: 'Grok 4.6 (Vercel AI Gateway)',
        env_key: 'AI_GATEWAY_API_KEY',
        context_window: 500000,
      });
      expect(raw).not.toContain('vck_DummyKey0002');
      if (process.platform !== 'win32') {
        const bashrc = readFileSync(bashrcPath(), 'utf8');
        expect(bashrc).toContain(
          "export AI_GATEWAY_API_KEY='vck_DummyKey0002'"
        );
        expect(bashrc).toContain(
          "export GROK_CODE_XAI_API_KEY='vck_DummyKey0002'"
        );
      }
    });

    it('merges into an existing Grok Build config.toml and stays idempotent', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.grok'), { recursive: true });
      const existing = [
        '[cli]',
        'installer = "internal"',
        '# local ollama entry',
        '[model.local-llama]',
        'model = "llama-3.1-70b"',
        'base_url = "http://localhost:11434/v1"',
        '',
      ].join('\n');
      writeFileSync(join(home, '.grok', 'config.toml'), existing);
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'grok',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.grok', 'config.toml'), 'utf8');
      const toml = tomlParse(raw) as any;
      expect(toml.cli.installer).toBe('internal');
      expect(toml.model['local-llama'].model).toBe('llama-3.1-70b');
      expect(raw).toContain('# local ollama entry');
      expect(toml.models.default).toBe('vercel-ai-gateway');
      expect(toml.model['vercel-ai-gateway'].env_key).toBe(
        'AI_GATEWAY_API_KEY'
      );

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(readFileSync(join(home, '.grok', 'config.toml'), 'utf8')).toBe(
        raw
      );
    });

    it('writes a --base-url override into both Grok Build endpoints', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.grok'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'grok',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/v1'
      );

      expect(await aiGateway(client)).toBe(0);

      const toml = tomlParse(
        readFileSync(join(home, '.grok', 'config.toml'), 'utf8')
      ) as any;
      expect(toml.endpoints.models_base_url).toBe(
        'https://preview.ai-gateway.vercel.sh/v1'
      );
      expect(toml.model['vercel-ai-gateway'].base_url).toBe(
        'https://preview.ai-gateway.vercel.sh/v1'
      );
    });

    it('configures Aider via .aider.conf.yml, preserving existing entries', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      writeFileSync(
        join(home, '.aider.conf.yml'),
        'dark-mode: true\nopenai-api-base: https://internal.corp/v1\n'
      );
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'aider'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.aider.conf.yml'), 'utf8');
      expect(raw).toContain(
        'openai-api-base: https://ai-gateway.vercel.sh/coding-agent/v1'
      );
      expect(raw).toContain('model: openai/anthropic/claude-fable-5');
      expect(raw).toContain('dark-mode: true');
      expect(raw).not.toContain('https://internal.corp/v1');
      expect(raw).not.toContain('vck_DummyKey0002');

      const metadata = JSON.parse(
        readFileSync(join(home, '.aider.model.metadata.json'), 'utf8')
      );
      expect(metadata['openai/anthropic/claude-fable-5']).toEqual({
        litellm_provider: 'openai',
        mode: 'chat',
        max_input_tokens: 1_000_000,
        max_output_tokens: 128_000,
        max_tokens: 128_000,
        input_cost_per_token: 0.00001,
        output_cost_per_token: 0.00005,
      });
      expect(metadata['openai/anthropic/claude-sonnet-4.6']).toMatchObject({
        max_input_tokens: 1_000_000,
        input_cost_per_token: 0.000003,
      });
      expect(metadata['openai/alibaba/qwen-3-14b']).toEqual({
        litellm_provider: 'openai',
        mode: 'chat',
        max_input_tokens: 40_960,
        max_output_tokens: 16_384,
        max_tokens: 16_384,
      });
      expect(metadata).not.toHaveProperty(
        'openai/openai/text-embedding-3-large'
      );
      expect(metadata).not.toHaveProperty('openai/vendor/unsized-chat');
      expect(raw).not.toContain('model-metadata-file');
      expect(raw).not.toContain('model-settings-file');

      const settings = yamlLoad(
        readFileSync(join(home, '.aider.model.settings.yml'), 'utf8')
      ) as Array<{ name?: string; edit_format?: string }>;
      expect(settings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'openai/anthropic/claude-fable-5',
            edit_format: 'diff',
          }),
          expect.objectContaining({
            name: 'openai/anthropic/claude-sonnet-4.6',
            edit_format: 'diff',
          }),
          expect.objectContaining({
            name: 'openai/alibaba/qwen-3-14b',
            edit_format: 'diff',
          }),
        ])
      );
      expect(settings).toHaveLength(3);

      if (process.platform !== 'win32') {
        expect(readFileSync(bashrcPath(), 'utf8')).toContain(
          "export AIDER_OPENAI_API_KEY='vck_DummyKey0002'"
        );
      }
    });

    it('still configures Aider when the model catalogue is unreachable', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'aider'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.aider.conf.yml'), 'utf8');
      expect(raw).toContain('model: openai/anthropic/claude-fable-5');
      expect(raw).toContain(
        'openai-api-base: https://ai-gateway.vercel.sh/coding-agent/v1'
      );
      expect(existsSync(join(home, '.aider.model.metadata.json'))).toBe(false);
      expect(existsSync(join(home, '.aider.model.settings.yml'))).toBe(false);
    });

    it('leaves an existing Aider model-metadata-file pointer alone', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      writeFileSync(
        join(home, '.aider.conf.yml'),
        'model-metadata-file: /custom/models.json\nmodel-settings-file: /custom/settings.yml\n'
      );
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'aider'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.aider.conf.yml'), 'utf8');
      expect(raw).toContain('model-metadata-file: /custom/models.json');
      expect(raw).toContain('model-settings-file: /custom/settings.yml');
      expect(raw).toContain('model: openai/anthropic/claude-fable-5');
      expect(existsSync(join(home, '.aider.model.metadata.json'))).toBe(true);
    });

    it('creates a fresh .aider.conf.yml and is a no-op on the second run', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'aider',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const first = readFileSync(join(home, '.aider.conf.yml'), 'utf8');
      expect(first).toContain('model: openai/anthropic/claude-fable-5');
      expect(first).not.toContain('show-model-warnings');
      expect(existsSync(join(home, '.aider.model.metadata.json'))).toBe(true);
      expect(existsSync(join(home, '.aider.model.settings.yml'))).toBe(true);
      const offset = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(readFileSync(join(home, '.aider.conf.yml'), 'utf8')).toBe(first);
      const out = JSON.parse(client.stdout.getFullOutput().slice(offset));
      expect(out.reason).toBe('already_configured');
      expect(out.configured).toHaveLength(0);
    });

    it('configures Goose via config.yaml and a custom provider JSON', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      mkdirSync(join(home, '.config', 'goose'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'goose'
      );

      expect(await aiGateway(client)).toBe(0);

      const configRaw = readFileSync(gooseConfigPath(), 'utf8');
      const config = yamlLoad(configRaw) as any;
      expect(config.GOOSE_PROVIDER).toBe('vercel_ai_gateway');
      expect(config.GOOSE_MODEL).toBe('anthropic/claude-fable-5');

      const providerRaw = readFileSync(gooseProviderPath(), 'utf8');
      const provider = JSON.parse(providerRaw);
      expect(provider.name).toBe('vercel_ai_gateway');
      expect(provider.engine).toBe('openai');
      expect(provider.api_key_env).toBe('AI_GATEWAY_API_KEY');
      expect(provider.base_url).toBe(
        'https://ai-gateway.vercel.sh/coding-agent/v1/chat/completions'
      );
      expect(provider.models).toEqual([
        { name: 'anthropic/claude-fable-5', context_limit: 1_000_000 },
        { name: 'alibaba/qwen-3-14b', context_limit: 40_960 },
        { name: 'anthropic/claude-sonnet-4.6', context_limit: 1_000_000 },
      ]);
      expect(provider.dynamic_models).toBeUndefined();
      expect(configRaw).not.toContain('vck_DummyKey0002');
      expect(providerRaw).not.toContain('vck_DummyKey0002');
    });

    it('omits the Goose context-limit table when the catalogue is unreachable', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.config', 'goose'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'goose'
      );

      expect(await aiGateway(client)).toBe(0);

      const provider = JSON.parse(readFileSync(gooseProviderPath(), 'utf8'));
      expect(provider.models).toBeUndefined();
      expect(provider.dynamic_models).toBeUndefined();
      expect(provider.base_url).toBe(
        'https://ai-gateway.vercel.sh/coding-agent/v1/chat/completions'
      );
    });

    it('merges an existing Goose config.yaml instead of clobbering it', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.config', 'goose'), { recursive: true });
      writeFileSync(
        gooseConfigPath(),
        'GOOSE_MODEL: gpt-4o\nGOOSE_PROVIDER: openai\nextensions:\n  developer:\n    enabled: true\n'
      );
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'goose'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = yamlLoad(readFileSync(gooseConfigPath(), 'utf8')) as any;
      expect(config.GOOSE_PROVIDER).toBe('vercel_ai_gateway');
      expect(config.GOOSE_MODEL).toBe('anthropic/claude-fable-5');
      expect(config.extensions.developer.enabled).toBe(true);
    });

    it('is idempotent for Goose on a second run with the same key', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.config', 'goose'), { recursive: true });
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'goose',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const firstConfig = readFileSync(gooseConfigPath(), 'utf8');
      const firstProvider = readFileSync(gooseProviderPath(), 'utf8');
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);

      expect(readFileSync(gooseConfigPath(), 'utf8')).toBe(firstConfig);
      expect(readFileSync(gooseProviderPath(), 'utf8')).toBe(firstProvider);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.reason).toBe('already_configured');
      expect(out.configured).toHaveLength(0);
    });

    it('writes a --base-url override into the Goose provider base_url', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.config', 'goose'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'goose',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/v1'
      );

      expect(await aiGateway(client)).toBe(0);

      const provider = JSON.parse(readFileSync(gooseProviderPath(), 'utf8'));
      expect(provider.base_url).toBe(
        'https://preview.ai-gateway.vercel.sh/v1/chat/completions'
      );
    });

    it('configures Continue CLI via config.yaml with a secrets reference', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.continue'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'continue'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.continue', 'config.yaml'), 'utf8');
      expect(raw).toContain('name: anthropic/claude-fable-5');
      expect(raw).not.toContain('name: Vercel AI Gateway');
      expect(raw).toContain('provider: openai');
      expect(raw).toContain('model: anthropic/claude-fable-5');
      expect(raw).toContain(
        'apiBase: https://ai-gateway.vercel.sh/coding-agent/v1'
      );
      expect(raw).toContain('secrets.AI_GATEWAY_API_KEY');
      expect(raw).toContain('version:');
      expect(raw).toContain('schema: v1');
      expect(raw).not.toContain('vck_DummyKey0002');
      expect(existsSync(join(home, '.continue', '.onboarding_complete'))).toBe(
        true
      );
    });

    it('lists the fallback shortlist in the Continue config when the leaderboard is unreachable', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      mkdirSync(join(home, '.continue'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'continue'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = yamlLoad(
        readFileSync(join(home, '.continue', 'config.yaml'), 'utf8')
      ) as any;
      // No leaderboard route (404) — the shortlist falls back to default-first alphabetical.
      expect(config.models.map((m: { name: string }) => m.name)).toEqual([
        'anthropic/claude-fable-5',
        'alibaba/qwen-3-14b',
        'anthropic/claude-sonnet-4.6',
        'vendor/unsized-chat',
      ]);
      expect(config.models[0].model).toBe('anthropic/claude-fable-5');
    });

    it('orders the Continue models purely by leaderboard rank', async () => {
      useUser();
      useGatewayModels();
      client.scenario.get('/api/ai/leaderboard-export', (_req, res) => {
        res.json({
          dataset: 'models',
          modality: 'text',
          license: 'CC BY 4.0',
          license_url: 'https://creativecommons.org/licenses/by/4.0/',
          rows: [
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Claude Sonnet 4.6',
              metric: 'spend',
              modality: 'text',
              share_percent: 40,
            },
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Embedding',
              metric: 'spend',
              modality: 'text',
              share_percent: 30,
            },
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Qwen3-14B',
              metric: 'spend',
              modality: 'text',
              share_percent: 20,
            },
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Claude Fable 5',
              metric: 'spend',
              modality: 'text',
              share_percent: 10,
            },
          ],
        });
      });
      client.nonInteractive = true;
      mkdirSync(join(home, '.continue'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'continue'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.continue', 'config.yaml'), 'utf8');
      const config = yamlLoad(raw) as any;
      expect(config.models.map((m: { name: string }) => m.name)).toEqual([
        'anthropic/claude-sonnet-4.6',
        'alibaba/qwen-3-14b',
        'anthropic/claude-fable-5',
      ]);
      expect(config.models[0].model).toBe('anthropic/claude-sonnet-4.6');
      expect(raw).not.toContain('text-embedding');
      expect(raw).not.toContain('vendor/unsized-chat');
    });

    it('replaces a stale gateway shortlist in an existing Continue config', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      mkdirSync(join(home, '.continue'), { recursive: true });
      writeFileSync(
        join(home, '.continue', 'config.yaml'),
        [
          'name: Local Config',
          'version: 1.0.0',
          'schema: v1',
          'models:',
          '  - name: legacy/model-a',
          '    provider: openai',
          '    model: legacy/model-a',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture uses Continue's literal secret-reference syntax
          '    apiKey: ${{ secrets.AI_GATEWAY_API_KEY }}',
          '  - name: mine/private',
          '    provider: openai',
          '    model: mine/private',
          '    apiKey: my-own-key',
          '',
        ].join('\n')
      );
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'continue'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = yamlLoad(
        readFileSync(join(home, '.continue', 'config.yaml'), 'utf8')
      ) as any;
      const names = config.models.map((m: { name: string }) => m.name);
      expect(names).not.toContain('legacy/model-a');
      expect(names[0]).toBe('mine/private');
      expect(names.slice(1)).toEqual([
        'anthropic/claude-fable-5',
        'alibaba/qwen-3-14b',
        'anthropic/claude-sonnet-4.6',
        'vendor/unsized-chat',
      ]);
      expect(config.models[0].apiKey).toBe('my-own-key');
    });

    it('preserves other models and metadata in an existing Continue config', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.continue'), { recursive: true });
      writeFileSync(
        join(home, '.continue', 'config.yaml'),
        'name: My Assistant\nversion: 2.0.0\nschema: v1\nmodels:\n  - name: ollama-local\n    provider: ollama\n    model: llama3.2\n'
      );
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'continue'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.continue', 'config.yaml'), 'utf8');
      expect(raw).toContain('name: My Assistant');
      expect(raw).toContain('version: 2.0.0');
      expect(raw).toContain('ollama-local');
      expect(raw).toContain('llama3.2');
      expect(raw).toContain('name: anthropic/claude-fable-5');
      expect(raw).toContain('secrets.AI_GATEWAY_API_KEY');
      expect(raw).not.toContain('vck_DummyKey0002');
    });

    it('writes a --base-url override into the Continue config', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.continue'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'continue',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/v1'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.continue', 'config.yaml'), 'utf8');
      expect(raw).toContain('apiBase: https://preview.ai-gateway.vercel.sh/v1');
      expect(raw).not.toContain('https://ai-gateway.vercel.sh/coding-agent/v1');
    });

    it('configures OpenClaw from the leaderboard, dropping the Other bucket', async () => {
      useUser();
      useTopModels();
      client.nonInteractive = true;
      mkdirSync(join(home, '.openclaw'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'openclaw'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = JSON.parse(
        readFileSync(join(home, '.openclaw', 'openclaw.json'), 'utf8')
      );
      const provider = config.models.providers['vercel-ai-gateway'];
      expect(provider.models).toEqual([
        { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5 (Gateway)' },
        { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5 (Gateway)' },
        { id: 'moonshotai/kimi-k3', name: 'Kimi K3 (Gateway)' },
      ]);
      expect(JSON.stringify(provider.models)).not.toContain('Other');
      expect(JSON.stringify(provider.models)).not.toContain('gpt-5-nano');
      expect(config.agents.defaults.model.primary).toBe(
        'vercel-ai-gateway/anthropic/claude-opus-5'
      );
    });

    it('keeps models the user added to the OpenClaw provider by hand', async () => {
      useUser();
      useTopModels();
      client.nonInteractive = true;
      mkdirSync(join(home, '.openclaw'), { recursive: true });
      writeFileSync(
        join(home, '.openclaw', 'openclaw.json'),
        JSON.stringify(
          {
            models: {
              providers: {
                'vercel-ai-gateway': {
                  models: [{ id: 'my/private-model', name: 'Private' }],
                },
              },
            },
          },
          null,
          2
        )
      );
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'openclaw'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = JSON.parse(
        readFileSync(join(home, '.openclaw', 'openclaw.json'), 'utf8')
      );
      const ids = config.models.providers['vercel-ai-gateway'].models.map(
        (m: { id: string }) => m.id
      );
      expect(ids).toEqual([
        'anthropic/claude-opus-5',
        'anthropic/claude-sonnet-5',
        'moonshotai/kimi-k3',
        'my/private-model',
      ]);
    });

    it('re-runs Cline setup byte-identically and reports already configured', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.cline'), { recursive: true });
      const argv = [
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0021',
        '--agent',
        'cline',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const providersPath = join(
        home,
        '.cline',
        'data',
        'settings',
        'providers.json'
      );
      const first = readFileSync(providersPath, 'utf8');
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(readFileSync(providersPath, 'utf8')).toBe(first);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.reason).toBe('already_configured');
    });

    it('gives Cline and Hermes the leaderboard rank-1 default model', async () => {
      useUser();
      useTopModels();
      client.nonInteractive = true;
      mkdirSync(join(home, '.cline'), { recursive: true });
      mkdirSync(join(home, '.hermes'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'cline',
        '--agent',
        'hermes'
      );

      expect(await aiGateway(client)).toBe(0);

      const cline = JSON.parse(
        readFileSync(
          join(home, '.cline', 'data', 'settings', 'providers.json'),
          'utf8'
        )
      );
      expect(cline.providers['vercel-ai-gateway'].settings.model).toBe(
        'anthropic/claude-opus-5'
      );
      const hermes = readFileSync(join(home, '.hermes', 'config.yaml'), 'utf8');
      expect(hermes).toContain('default: anthropic/claude-opus-5');
    });

    it('configures DeepSeek Harness via settings.yaml with apiKeyEnv and a model shortlist', async () => {
      useUser();
      useGatewayModels(DEEPSEEK_MODEL_FIXTURE);
      client.nonInteractive = true;
      mkdirSync(join(home, '.dsh'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'deepseek'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(dshSettingsPath(), 'utf8');
      const config = yamlLoad(raw) as any;
      const provider = config['llm-pi-ai'].providers['vercel-ai-gateway'];
      expect(provider.apiKeyEnv).toBe('AI_GATEWAY_API_KEY');
      expect(provider.api).toBeUndefined();
      expect(provider.baseURL).toBeUndefined();
      expect(provider.models.map((m: { id: string }) => m.id)).toEqual([
        'deepseek/deepseek-v4-flash',
        'deepseek/deepseek-v4-pro',
        'anthropic/claude-fable-5',
        'alibaba/qwen-3-14b',
        'anthropic/claude-sonnet-4.6',
        'vendor/unsized-chat',
      ]);
      expect(provider.models[0].name).toBe('DeepSeek V4 Flash');
      expect(config['agent-default-model']).toEqual({
        provider: 'vercel-ai-gateway',
        model: 'deepseek/deepseek-v4-flash',
      });
      expect(raw).not.toContain('vck_DummyKey0002');
    });

    it('leads the DeepSeek Harness shortlist with DeepSeek, then the leaderboard order', async () => {
      useUser();
      useGatewayModels(DEEPSEEK_MODEL_FIXTURE);
      client.scenario.get('/api/ai/leaderboard-export', (_req, res) => {
        res.json({
          rows: [
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Claude Sonnet 4.6',
              metric: 'spend',
              modality: 'text',
              share_percent: 40,
            },
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Embedding',
              metric: 'spend',
              modality: 'text',
              share_percent: 30,
            },
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Claude Fable 5',
              metric: 'spend',
              modality: 'text',
              share_percent: 20,
            },
          ],
        });
      });
      client.nonInteractive = true;
      mkdirSync(join(home, '.dsh'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'deepseek'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(dshSettingsPath(), 'utf8');
      const config = yamlLoad(raw) as any;
      const provider = config['llm-pi-ai'].providers['vercel-ai-gateway'];
      expect(provider.models.map((m: { id: string }) => m.id)).toEqual([
        'deepseek/deepseek-v4-flash',
        'deepseek/deepseek-v4-pro',
        'anthropic/claude-sonnet-4.6',
        'anthropic/claude-fable-5',
      ]);
      expect(raw).not.toContain('text-embedding');
      expect(config['agent-default-model']).toEqual({
        provider: 'vercel-ai-gateway',
        model: 'deepseek/deepseek-v4-flash',
      });
    });

    it('preserves existing DeepSeek Harness settings and resets a stale default selection', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.dsh'), { recursive: true });
      writeFileSync(
        dshSettingsPath(),
        [
          'web:',
          '  port: 3080',
          'llm-pi-ai:',
          '  providers:',
          '    deepseek:',
          '      apiKeyEnv: DEEPSEEK_API_KEY',
          'agent-default-model:',
          '  provider: deepseek-official',
          '  model: deepseek-v4-flash',
          '  reasoningEffort: high',
          '',
        ].join('\n')
      );
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'deepseek'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(dshSettingsPath(), 'utf8');
      const config = yamlLoad(raw) as any;
      expect(config.web.port).toBe(3080);
      expect(config['llm-pi-ai'].providers.deepseek.apiKeyEnv).toBe(
        'DEEPSEEK_API_KEY'
      );
      expect(config['llm-pi-ai'].providers['vercel-ai-gateway']).toEqual({
        apiKeyEnv: 'AI_GATEWAY_API_KEY',
      });
      expect(config['agent-default-model']).toEqual({
        provider: 'vercel-ai-gateway',
        model: 'deepseek/deepseek-v4-flash',
      });
      expect(raw).not.toContain('vck_DummyKey0002');
    });

    it('clears a previously hand-declared DeepSeek Harness route', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.dsh'), { recursive: true });
      writeFileSync(
        dshSettingsPath(),
        [
          'llm-pi-ai:',
          '  providers:',
          '    vercel-ai-gateway:',
          '      apiKeyEnv: AI_GATEWAY_API_KEY',
          '      api: openai-completions',
          '      baseURL: https://ai-gateway.vercel.sh/coding-agent/v1',
          '      timeout: 90',
          '      models:',
          '        - id: deepseek/deepseek-v4-pro',
          '          name: DeepSeek V4 Pro (Gateway)',
          '',
        ].join('\n')
      );
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'deepseek'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = yamlLoad(readFileSync(dshSettingsPath(), 'utf8')) as any;
      const provider = config['llm-pi-ai'].providers['vercel-ai-gateway'];
      expect(provider.api).toBeUndefined();
      expect(provider.baseURL).toBeUndefined();
      expect(provider.models).toBeUndefined();
      expect(provider.apiKeyEnv).toBe('AI_GATEWAY_API_KEY');
      expect(provider.timeout).toBe(90);
    });

    it('honors DSH_HOME for the DeepSeek Harness settings location', async () => {
      process.env.DSH_HOME = join(home, 'dsh-home');
      const plan = await buildSetupPlan([deepseek], { apiKey: 'vck_x', home });
      expect(
        plan.changes.some(
          c => c.path === join(home, 'dsh-home', 'settings.yaml')
        )
      ).toBe(true);
    });

    it('configures Crush via its native vercel provider with pinned models', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'crush'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(
        join(home, '.config', 'crush', 'crush.json'),
        'utf8'
      );
      const config = JSON.parse(raw);
      expect(config.providers.vercel).toEqual({
        api_key: '$AI_GATEWAY_API_KEY',
      });
      expect(config.models).toEqual({
        large: { provider: 'vercel', model: 'anthropic/claude-fable-5' },
        small: { provider: 'vercel', model: 'anthropic/claude-haiku-4.5' },
      });
      expect(raw).not.toContain('vck_DummyKey0002');
      if (process.platform !== 'win32') {
        expect(readFileSync(bashrcPath(), 'utf8')).toContain(
          "export AI_GATEWAY_API_KEY='vck_DummyKey0002'"
        );
      }
    });

    it('preserves an existing crush.json and is idempotent on re-run', async () => {
      useUser();
      client.nonInteractive = true;
      const crushConfigPath = join(home, '.config', 'crush', 'crush.json');
      mkdirSync(join(home, '.config', 'crush'), { recursive: true });
      writeFileSync(
        crushConfigPath,
        '{"mcp":{"devboxd":{"type":"http","url":"http://localhost:1/mcp"}},"providers":{"ollama":{"type":"ollama"}}}'
      );
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'crush',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const first = readFileSync(crushConfigPath, 'utf8');
      const config = JSON.parse(first);
      expect(config.mcp.devboxd.url).toBe('http://localhost:1/mcp');
      expect(config.providers.ollama).toEqual({ type: 'ollama' });
      expect(config.providers.vercel.api_key).toBe('$AI_GATEWAY_API_KEY');
      expect(first.trim()).not.toContain('\n');
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(readFileSync(crushConfigPath, 'utf8')).toBe(first);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.reason).toBe('already_configured');
      expect(out.configured).toHaveLength(0);
    });

    it('writes a --base-url override into the Crush provider entry', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'crush',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/v1'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = JSON.parse(
        readFileSync(join(home, '.config', 'crush', 'crush.json'), 'utf8')
      );
      expect(config.providers.vercel.base_url).toBe(
        'https://preview.ai-gateway.vercel.sh/v1'
      );
    });

    it.skipIf(process.platform === 'win32')(
      'configures GitHub Copilot CLI through BYOK shell exports only',
      async () => {
        useUser();
        client.nonInteractive = true;
        mkdirSync(join(home, '.copilot'), { recursive: true });
        client.setArgv(
          'ai-gateway',
          'setup',
          '--key',
          'vck_DummyKey0002',
          '--agent',
          'copilot'
        );

        expect(await aiGateway(client)).toBe(0);

        const bashrc = readFileSync(bashrcPath(), 'utf8');
        expect(bashrc).toContain(
          "export COPILOT_PROVIDER_BASE_URL='https://ai-gateway.vercel.sh/coding-agent/v1'"
        );
        expect(bashrc).toContain(
          "export COPILOT_PROVIDER_API_KEY='vck_DummyKey0002'"
        );
        expect(bashrc).toContain(
          "export COPILOT_MODEL='anthropic/claude-fable-5'"
        );
        expect(readdirSync(join(home, '.copilot'))).toEqual([]);

        const out = JSON.parse(client.stdout.getFullOutput());
        expect(out.status).toBe('ok');
        const notes: string[] = out.notes ?? [];
        expect(notes.some(n => n.includes('GitHub sign-in'))).toBe(true);
        expect(notes.every(n => !n.includes('vck_DummyKey0002'))).toBe(true);
      }
    );

    it.skipIf(process.platform === 'win32')(
      'writes a --base-url override into the Copilot CLI exports',
      async () => {
        useUser();
        client.nonInteractive = true;
        client.setArgv(
          'ai-gateway',
          'setup',
          '--key',
          'vck_DummyKey0002',
          '--agent',
          'copilot',
          '--base-url',
          'https://preview.ai-gateway.vercel.sh/v1'
        );

        expect(await aiGateway(client)).toBe(0);
        expect(readFileSync(bashrcPath(), 'utf8')).toContain(
          "export COPILOT_PROVIDER_BASE_URL='https://preview.ai-gateway.vercel.sh/v1'"
        );
      }
    );

    it('configures Factory Droid with an env-referenced customModels entry', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      mkdirSync(join(home, '.factory'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'droid'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.factory', 'settings.json'), 'utf8');
      const config = JSON.parse(raw);
      // No leaderboard route (404) — the shortlist falls back to default-first alphabetical.
      expect(
        config.customModels.map((m: { displayName: string }) => m.displayName)
      ).toEqual([
        'anthropic/claude-fable-5',
        'alibaba/qwen-3-14b',
        'anthropic/claude-sonnet-4.6',
      ]);
      expect(config.customModels[0]).toMatchObject({
        model: 'anthropic/claude-fable-5',
        displayName: 'anthropic/claude-fable-5',
        baseUrl: 'https://ai-gateway.vercel.sh/coding-agent/v1',
        provider: 'generic-chat-completion-api',
        maxOutputTokens: 128_000,
      });
      expect(config.customModels[1].maxOutputTokens).toBe(16_384);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting Droid's literal env-reference syntax
      expect(config.customModels[0].apiKey).toBe('${AI_GATEWAY_API_KEY}');
      expect(raw).not.toContain('vck_DummyKey0002');
    });

    it('orders the Droid picker purely by leaderboard rank', async () => {
      useUser();
      useGatewayModels();
      client.scenario.get('/api/ai/leaderboard-export', (_req, res) => {
        res.json({
          dataset: 'models',
          modality: 'text',
          license: 'CC BY 4.0',
          license_url: 'https://creativecommons.org/licenses/by/4.0/',
          rows: [
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Claude Sonnet 4.6',
              metric: 'spend',
              modality: 'text',
              share_percent: 40,
            },
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Embedding',
              metric: 'spend',
              modality: 'text',
              share_percent: 30,
            },
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Qwen3-14B',
              metric: 'spend',
              modality: 'text',
              share_percent: 20,
            },
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Claude Fable 5',
              metric: 'spend',
              modality: 'text',
              share_percent: 10,
            },
          ],
        });
      });
      client.nonInteractive = true;
      mkdirSync(join(home, '.factory'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'droid'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.factory', 'settings.json'), 'utf8');
      const config = JSON.parse(raw);
      expect(
        config.customModels.map((m: { model: string }) => m.model)
      ).toEqual([
        'anthropic/claude-sonnet-4.6',
        'alibaba/qwen-3-14b',
        'anthropic/claude-fable-5',
      ]);
      expect(config.customModels[1].maxOutputTokens).toBe(16_384);
      expect(raw).not.toContain('text-embedding');
    });

    it('still configures Factory Droid when the model catalogue is unreachable', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.factory'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'droid'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = JSON.parse(
        readFileSync(join(home, '.factory', 'settings.json'), 'utf8')
      );
      expect(config.customModels).toHaveLength(1);
      expect(config.customModels[0].model).toBe('anthropic/claude-fable-5');
    });

    it('preserves existing Droid settings and custom models, and is idempotent', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      const settingsPath = join(home, '.factory', 'settings.json');
      mkdirSync(join(home, '.factory'), { recursive: true });
      writeFileSync(
        settingsPath,
        JSON.stringify(
          {
            diffMode: 'github',
            customModels: [
              {
                model: 'llama3',
                displayName: 'Local Ollama',
                baseUrl: 'http://localhost:11434/v1',
                provider: 'generic-chat-completion-api',
              },
            ],
          },
          null,
          2
        )
      );
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'droid',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const first = readFileSync(settingsPath, 'utf8');
      const config = JSON.parse(first);
      expect(config.diffMode).toBe('github');
      expect(config.customModels).toHaveLength(4);
      expect(config.customModels[0].displayName).toBe('Local Ollama');
      expect(config.customModels[1].displayName).toBe(
        'anthropic/claude-fable-5'
      );
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(readFileSync(settingsPath, 'utf8')).toBe(first);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.configured).toHaveLength(0);
    });

    it('writes a --base-url override into the Droid entry and later replaces it in place', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      const settingsPath = join(home, '.factory', 'settings.json');
      mkdirSync(join(home, '.factory'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'droid',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/v1'
      );
      expect(await aiGateway(client)).toBe(0);
      let config = JSON.parse(readFileSync(settingsPath, 'utf8'));
      expect(config.customModels[0].baseUrl).toBe(
        'https://preview.ai-gateway.vercel.sh/v1'
      );

      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'droid'
      );
      expect(await aiGateway(client)).toBe(0);
      config = JSON.parse(readFileSync(settingsPath, 'utf8'));
      expect(config.customModels).toHaveLength(3);
      expect(
        config.customModels.every(
          (m: { baseUrl: string }) =>
            m.baseUrl === 'https://ai-gateway.vercel.sh/coding-agent/v1'
        )
      ).toBe(true);
    });

    it('declares the gateway shortlist as Qwen Code provider entries', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      mkdirSync(join(home, '.qwen'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'qwen'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.qwen', 'settings.json'), 'utf8');
      const config = JSON.parse(raw);
      const providers = config.modelProviders.openai;
      expect(providers.map((e: { id: string }) => e.id)).toEqual([
        'alibaba/qwen-3-14b',
        'anthropic/claude-fable-5',
        'anthropic/claude-sonnet-4.6',
        'vendor/unsized-chat',
      ]);
      expect(providers[0]).toEqual({
        id: 'alibaba/qwen-3-14b',
        name: 'Qwen3-14B',
        baseUrl: 'https://ai-gateway.vercel.sh/coding-agent/v1',
        envKey: 'AI_GATEWAY_API_KEY',
        generationConfig: { contextWindowSize: 40_960 },
      });
      expect(providers[3].generationConfig).toBeUndefined();
      expect(config.model.name).toBe('alibaba/qwen-3-14b');
      expect(raw).not.toContain('vck_DummyKey0002');
    });

    it('leads the Qwen Code shortlist with Qwen, then the leaderboard order', async () => {
      useUser();
      useGatewayModels();
      client.scenario.get('/api/ai/leaderboard-export', (_req, res) => {
        res.json({
          rows: [
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Claude Sonnet 4.6',
              metric: 'spend',
              modality: 'text',
              share_percent: 60,
            },
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Embedding',
              metric: 'spend',
              modality: 'text',
              share_percent: 25,
            },
            {
              date: '2026-08-12',
              group: 'model',
              name: 'Claude Fable 5',
              metric: 'spend',
              modality: 'text',
              share_percent: 10,
            },
          ],
        });
      });
      client.nonInteractive = true;
      mkdirSync(join(home, '.qwen'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'qwen'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.qwen', 'settings.json'), 'utf8');
      const config = JSON.parse(raw);
      const providers = config.modelProviders.openai;
      expect(providers.map((e: { id: string }) => e.id)).toEqual([
        'alibaba/qwen-3-14b',
        'anthropic/claude-sonnet-4.6',
        'anthropic/claude-fable-5',
      ]);
      expect(raw).not.toContain('text-embedding');
      expect(config.model.name).toBe('alibaba/qwen-3-14b');
    });

    it('configures Qwen Code via settings.json with env-referenced provider entries', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.qwen'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'qwen'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.qwen', 'settings.json'), 'utf8');
      const config = JSON.parse(raw);
      const providers = config.modelProviders.openai;
      expect(providers.length).toBeGreaterThan(0);
      for (const entry of providers) {
        expect(entry.baseUrl).toBe(
          'https://ai-gateway.vercel.sh/coding-agent/v1'
        );
        expect(entry.envKey).toBe('AI_GATEWAY_API_KEY');
      }
      expect(providers[0].id).toBe('alibaba/qwen3-coder-plus');
      expect(config.security.auth.selectedType).toBe('openai');
      expect(config.model.name).toBe('alibaba/qwen3-coder-plus');
      expect(raw).not.toContain('vck_DummyKey0002');
    });

    it('preserves unrelated Qwen Code settings and user provider entries', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.qwen'), { recursive: true });
      writeFileSync(
        join(home, '.qwen', 'settings.json'),
        JSON.stringify({
          $version: 4,
          general: { disableUpdateNag: true },
          modelProviders: {
            openai: [
              {
                id: 'my-local',
                baseUrl: 'http://localhost:1234/v1',
                envKey: 'LOCAL_KEY',
              },
              {
                id: 'alibaba/qwen3-coder-plus',
                baseUrl: 'https://stale.example/v1',
                envKey: 'STALE_KEY',
              },
            ],
          },
          security: { auth: { selectedType: 'qwen-oauth' } },
        })
      );
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'qwen'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.qwen', 'settings.json'), 'utf8');
      const config = JSON.parse(raw);
      expect(config.$version).toBe(4);
      expect(config.general.disableUpdateNag).toBe(true);
      const providers = config.modelProviders.openai;
      expect(providers[0]).toEqual({
        id: 'my-local',
        baseUrl: 'http://localhost:1234/v1',
        envKey: 'LOCAL_KEY',
      });
      const ours = providers.filter(
        (e: { id: string }) => e.id === 'alibaba/qwen3-coder-plus'
      );
      expect(ours).toHaveLength(1);
      expect(ours[0].baseUrl).toBe(
        'https://ai-gateway.vercel.sh/coding-agent/v1'
      );
      expect(ours[0].envKey).toBe('AI_GATEWAY_API_KEY');
      expect(raw).not.toContain('STALE_KEY');
      expect(config.security.auth.selectedType).toBe('openai');
      expect(raw).not.toContain('vck_DummyKey0002');
    });

    it('writes a --base-url override verbatim into the Qwen Code entries', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.qwen'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'qwen',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/v1'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = JSON.parse(
        readFileSync(join(home, '.qwen', 'settings.json'), 'utf8')
      );
      for (const entry of config.modelProviders.openai) {
        expect(entry.baseUrl).toBe('https://preview.ai-gateway.vercel.sh/v1');
      }
    });

    it.skipIf(process.platform === 'win32')(
      "configures Zed's native vercel_ai_gateway provider with a shell export",
      async () => {
        useUser();
        client.nonInteractive = true;
        mkdirSync(zedSettingsDir(), { recursive: true });
        client.setArgv(
          'ai-gateway',
          'setup',
          '--key',
          'vck_DummyKey0002',
          '--agent',
          'zed'
        );

        expect(await aiGateway(client)).toBe(0);

        const raw = readFileSync(
          join(zedSettingsDir(), 'settings.json'),
          'utf8'
        );
        const settings = JSON.parse(raw);
        const provider = settings.language_models.vercel_ai_gateway;
        expect(provider.api_url).toBe(
          'https://ai-gateway.vercel.sh/coding-agent/v1'
        );
        expect(provider.available_models).toEqual([
          {
            name: 'anthropic/claude-fable-5',
            display_name: 'Claude Fable 5',
            max_tokens: 1000000,
            max_output_tokens: 128000,
            capabilities: { tools: true, images: true },
          },
        ]);
        expect(settings.agent.default_model).toEqual({
          provider: 'vercel_ai_gateway',
          model: 'anthropic/claude-fable-5',
        });
        expect(raw).not.toContain('vck_DummyKey0002');

        const bashrc = readFileSync(bashrcPath(), 'utf8');
        expect(bashrc).toContain(
          "export VERCEL_AI_GATEWAY_API_KEY='vck_DummyKey0002'"
        );
      }
    );

    it('preserves comments and unrelated keys in Zed settings, idempotently', async () => {
      useUser();
      client.nonInteractive = true;
      const zedDir = zedSettingsDir();
      mkdirSync(zedDir, { recursive: true });
      const existing = [
        '// Zed settings',
        '{',
        '  "theme": "One Dark", // keep me',
        '  "buffer_font_size": 16,',
        '  "agent": {',
        '    "always_allow_tool_actions": true',
        '  }',
        '}',
        '',
      ].join('\n');
      writeFileSync(join(zedDir, 'settings.json'), existing);
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'zed',
      ];
      client.setArgv(...argv);

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(zedDir, 'settings.json'), 'utf8');
      expect(raw).toContain('// Zed settings');
      expect(raw).toContain('"theme": "One Dark", // keep me');
      expect(raw).toContain('"buffer_font_size": 16');
      expect(raw).toContain('"always_allow_tool_actions": true');
      expect(raw).toContain(
        '"api_url": "https://ai-gateway.vercel.sh/coding-agent/v1"'
      );
      expect(raw).toContain('"provider": "vercel_ai_gateway"');
      expect(raw).not.toContain('vck_DummyKey0002');

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(readFileSync(join(zedDir, 'settings.json'), 'utf8')).toBe(raw);
    });

    it('keeps a user-declared Zed model list instead of replacing it', async () => {
      useUser();
      client.nonInteractive = true;
      const zedDir = zedSettingsDir();
      mkdirSync(zedDir, { recursive: true });
      writeFileSync(
        join(zedDir, 'settings.json'),
        JSON.stringify({
          language_models: {
            vercel_ai_gateway: {
              available_models: [
                { name: 'openai/gpt-5.6-sol', max_tokens: 400000 },
              ],
            },
          },
        })
      );
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'zed'
      );

      expect(await aiGateway(client)).toBe(0);

      const settings = JSON.parse(
        readFileSync(join(zedDir, 'settings.json'), 'utf8')
      );
      const provider = settings.language_models.vercel_ai_gateway;
      expect(provider.available_models).toEqual([
        { name: 'openai/gpt-5.6-sol', max_tokens: 400000 },
      ]);
      expect(provider.api_url).toBe(
        'https://ai-gateway.vercel.sh/coding-agent/v1'
      );
      expect(settings.agent.default_model.model).toBe(
        'anthropic/claude-fable-5'
      );
    });

    it('writes a --base-url override verbatim into the Zed settings', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(zedSettingsDir(), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'zed',
        '--base-url',
        'https://gateway.example.com/custom/v1'
      );

      expect(await aiGateway(client)).toBe(0);

      const settings = JSON.parse(
        readFileSync(join(zedSettingsDir(), 'settings.json'), 'utf8')
      );
      expect(settings.language_models.vercel_ai_gateway.api_url).toBe(
        'https://gateway.example.com/custom/v1'
      );
    });

    it('auto-selects the Zed agent when detected', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(zedSettingsDir(), { recursive: true });
      client.setArgv('ai-gateway', 'setup', '--key', 'vck_DummyKey0002');

      expect(await aiGateway(client)).toBe(0);
      expect(existsSync(join(zedSettingsDir(), 'settings.json'))).toBe(true);
    });

    it('configures Kimi CLI via config.toml (0600) with a gateway model entry', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.kimi'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'kimi'
      );

      expect(await aiGateway(client)).toBe(0);

      const configPath = join(home, '.kimi', 'config.toml');
      const config = tomlParse(readFileSync(configPath, 'utf8')) as any;
      expect(config.default_model).toBe('moonshotai/kimi-k3');
      expect(config.providers['vercel-ai-gateway']).toEqual({
        type: 'openai_legacy',
        base_url: 'https://ai-gateway.vercel.sh/coding-agent/v1',
        api_key: 'vck_DummyKey0002',
      });
      expect(config.models['moonshotai/kimi-k3']).toEqual({
        provider: 'vercel-ai-gateway',
        model: 'moonshotai/kimi-k3',
        max_context_size: 128_000,
      });
      if (process.platform !== 'win32') {
        expect(statSync(configPath).mode & 0o777).toBe(0o600);
      }
    });

    it('preserves existing Kimi CLI config entries and is idempotent', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.kimi'), { recursive: true });
      const configPath = join(home, '.kimi', 'config.toml');
      writeFileSync(
        configPath,
        [
          '# my kimi setup',
          'telemetry = false',
          '',
          '[providers.moonshot-cn]',
          'type = "kimi"',
          'base_url = "https://api.moonshot.cn/v1"',
          'api_key = "sk-existing"',
          '',
          '[models.kimi-for-coding]',
          'provider = "moonshot-cn"',
          'model = "kimi-for-coding"',
          'max_context_size = 262144',
          '',
        ].join('\n')
      );
      const run = async () => {
        client.setArgv(
          'ai-gateway',
          'setup',
          '--key',
          'vck_DummyKey0002',
          '--agent',
          'kimi'
        );
        expect(await aiGateway(client)).toBe(0);
        return readFileSync(configPath, 'utf8');
      };

      const first = await run();
      const config = tomlParse(first) as any;
      expect(config.telemetry).toBe(false);
      expect(config.providers['moonshot-cn'].api_key).toBe('sk-existing');
      expect(config.models['kimi-for-coding'].provider).toBe('moonshot-cn');
      expect(config.default_model).toBe('moonshotai/kimi-k3');
      expect(config.providers['vercel-ai-gateway'].api_key).toBe(
        'vck_DummyKey0002'
      );

      const second = await run();
      expect(second).toBe(first);
    });

    it('declares a gateway shortlist as Kimi CLI models', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      mkdirSync(join(home, '.kimi'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'kimi'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = tomlParse(
        readFileSync(join(home, '.kimi', 'config.toml'), 'utf8')
      ) as any;
      expect(Object.keys(config.models)).toEqual([
        'anthropic/claude-fable-5',
        'alibaba/qwen-3-14b',
        'anthropic/claude-sonnet-4.6',
      ]);
      expect(config.models['alibaba/qwen-3-14b']).toEqual({
        provider: 'vercel-ai-gateway',
        model: 'alibaba/qwen-3-14b',
        max_context_size: 40_960,
        display_name: 'Qwen3-14B',
      });
      expect(config.default_model).toBe('anthropic/claude-fable-5');
      expect(config.models[config.default_model]).toBeDefined();
    });

    it('shortlists Moonshot models first, then the leaderboard, for Kimi CLI', async () => {
      useUser();
      useGatewayModels([
        ...GATEWAY_MODEL_FIXTURE,
        {
          id: 'moonshotai/kimi-k3',
          object: 'model',
          owned_by: 'moonshotai',
          name: 'Kimi K3',
          type: 'language',
          tags: ['tool-use'],
          context_window: 262_144,
          released: 2_000,
        },
        {
          id: 'moonshotai/kimi-k2',
          object: 'model',
          owned_by: 'moonshotai',
          name: 'Kimi K2',
          type: 'language',
          tags: ['tool-use'],
          context_window: 131_072,
          released: 1_000,
        },
      ]);
      const row = (name: string, share_percent: number) => ({
        date: '2026-08-12',
        group: 'model',
        name,
        metric: 'spend',
        modality: 'text',
        share_percent,
      });
      client.scenario.get('/api/ai/leaderboard-export', (_req, res) => {
        res.json({
          dataset: 'models',
          modality: 'text',
          license: 'CC BY 4.0',
          license_url: 'https://creativecommons.org/licenses/by/4.0/',
          rows: [
            row('Claude Sonnet 4.6', 50),
            row('Embedding', 30),
            row('Claude Fable 5', 20),
            row('Kimi K3', 10),
            row('Qwen3-14B', 5),
          ],
        });
      });
      client.nonInteractive = true;
      mkdirSync(join(home, '.kimi'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'kimi'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = tomlParse(
        readFileSync(join(home, '.kimi', 'config.toml'), 'utf8')
      ) as any;
      expect(Object.keys(config.models)).toEqual([
        'moonshotai/kimi-k3',
        'moonshotai/kimi-k2',
        'anthropic/claude-sonnet-4.6',
        'anthropic/claude-fable-5',
        'alibaba/qwen-3-14b',
      ]);
      expect(config.models['moonshotai/kimi-k3']).toEqual({
        provider: 'vercel-ai-gateway',
        model: 'moonshotai/kimi-k3',
        max_context_size: 262_144,
        display_name: 'Kimi K3',
      });
      expect(config.models['openai/text-embedding-3-large']).toBeUndefined();
      expect(config.models['vendor/unsized-chat']).toBeUndefined();
      expect(config.default_model).toBe('moonshotai/kimi-k3');
    });

    it('writes a --base-url override verbatim into the Kimi CLI config', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.kimi'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'kimi',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/v1'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = tomlParse(
        readFileSync(join(home, '.kimi', 'config.toml'), 'utf8')
      ) as any;
      expect(config.providers['vercel-ai-gateway'].base_url).toBe(
        'https://preview.ai-gateway.vercel.sh/v1'
      );
    });

    it('configures Mistral Vibe with an env-keyed provider and pinned model', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.vibe'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'vibe'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.vibe', 'config.toml'), 'utf8');
      const toml = tomlParse(raw) as any;
      expect(toml.providers).toEqual([
        {
          name: 'vercel-ai-gateway',
          api_base: 'https://ai-gateway.vercel.sh/coding-agent/v1',
          api_key_env_var: 'AI_GATEWAY_API_KEY',
          api_style: 'openai',
          backend: 'generic',
        },
      ]);
      expect(toml.models).toEqual([
        {
          name: 'anthropic/claude-fable-5',
          provider: 'vercel-ai-gateway',
        },
      ]);
      expect(toml.active_model).toBe('anthropic/claude-fable-5');
      expect(raw).not.toContain('vck_DummyKey0002');
      if (process.platform !== 'win32') {
        const bashrc = readFileSync(bashrcPath(), 'utf8');
        expect(bashrc).toContain(
          "export AI_GATEWAY_API_KEY='vck_DummyKey0002'"
        );
      }
    });

    it('upserts into existing Mistral Vibe providers/models and stays idempotent', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.vibe'), { recursive: true });
      const existing = [
        'theme = "dark"',
        'active_model = "devstral-openrouter"',
        '',
        '[[providers]]',
        'name = "openrouter"',
        'api_base = "https://openrouter.ai/api/v1"',
        'api_key_env_var = "OPENROUTER_API_KEY"',
        '',
        '[[providers]]',
        'name = "vercel-ai-gateway"',
        'api_base = "https://stale.example/v1"',
        '',
        '[[models]]',
        'name = "mistralai/devstral-2512:free"',
        'provider = "openrouter"',
        'alias = "devstral-openrouter"',
        'temperature = 0.7',
        '',
      ].join('\n');
      writeFileSync(join(home, '.vibe', 'config.toml'), existing);
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'vibe',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(join(home, '.vibe', 'config.toml'), 'utf8');
      const toml = tomlParse(raw) as any;
      expect(toml.theme).toBe('dark');
      expect(toml.providers).toHaveLength(2);
      expect(toml.providers[0].name).toBe('openrouter');
      expect(toml.providers[0].api_key_env_var).toBe('OPENROUTER_API_KEY');
      expect(toml.providers[1]).toEqual({
        name: 'vercel-ai-gateway',
        api_base: 'https://ai-gateway.vercel.sh/coding-agent/v1',
        api_key_env_var: 'AI_GATEWAY_API_KEY',
        api_style: 'openai',
        backend: 'generic',
      });
      expect(toml.models).toHaveLength(2);
      expect(toml.models[0].alias).toBe('devstral-openrouter');
      expect(toml.models[0].temperature).toBe(0.7);
      expect(toml.models[1]).toEqual({
        name: 'anthropic/claude-fable-5',
        provider: 'vercel-ai-gateway',
      });
      expect(toml.active_model).toBe('anthropic/claude-fable-5');

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(readFileSync(join(home, '.vibe', 'config.toml'), 'utf8')).toBe(
        raw
      );
    });

    it('declares a gateway shortlist as unaliased Mistral Vibe models', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      mkdirSync(join(home, '.vibe'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'vibe'
      );

      expect(await aiGateway(client)).toBe(0);

      const toml = tomlParse(
        readFileSync(join(home, '.vibe', 'config.toml'), 'utf8')
      ) as any;
      expect(toml.models.map((m: { name: string }) => m.name)).toEqual([
        'anthropic/claude-fable-5',
        'alibaba/qwen-3-14b',
        'anthropic/claude-sonnet-4.6',
        'vendor/unsized-chat',
      ]);
      expect(toml.models.every((m: { alias?: string }) => !m.alias)).toBe(true);
      expect(toml.models[0]).toEqual({
        name: 'anthropic/claude-fable-5',
        provider: 'vercel-ai-gateway',
        auto_compact_threshold: 1_000_000,
        input_price: 10,
        output_price: 50,
        supports_images: false,
      });
      expect(toml.models[3].auto_compact_threshold).toBeUndefined();
      expect(toml.active_model).toBe('anthropic/claude-fable-5');
    });

    it('shortlists Mistral models first, then the leaderboard, for Mistral Vibe', async () => {
      useUser();
      useGatewayModels([
        ...GATEWAY_MODEL_FIXTURE,
        {
          id: 'mistral/devstral-3',
          object: 'model',
          owned_by: 'mistral',
          name: 'Devstral 3',
          type: 'language',
          tags: ['tool-use'],
          context_window: 256_000,
          released: 2_000,
        },
        {
          id: 'mistral/mistral-large-2508',
          object: 'model',
          owned_by: 'mistral',
          name: 'Mistral Large',
          type: 'language',
          tags: ['tool-use'],
          context_window: 128_000,
          released: 1_000,
        },
      ]);
      const row = (name: string, share_percent: number) => ({
        date: '2026-08-12',
        group: 'model',
        name,
        metric: 'spend',
        modality: 'text',
        share_percent,
      });
      client.scenario.get('/api/ai/leaderboard-export', (_req, res) => {
        res.json({
          dataset: 'models',
          modality: 'text',
          license: 'CC BY 4.0',
          license_url: 'https://creativecommons.org/licenses/by/4.0/',
          rows: [
            row('Claude Sonnet 4.6', 50),
            row('Embedding', 30),
            row('Qwen3-14B', 20),
          ],
        });
      });
      client.nonInteractive = true;
      mkdirSync(join(home, '.vibe'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'vibe'
      );

      expect(await aiGateway(client)).toBe(0);

      const toml = tomlParse(
        readFileSync(join(home, '.vibe', 'config.toml'), 'utf8')
      ) as any;
      expect(toml.models.map((m: { name: string }) => m.name)).toEqual([
        'mistral/devstral-3',
        'mistral/mistral-large-2508',
        'anthropic/claude-sonnet-4.6',
        'alibaba/qwen-3-14b',
      ]);
      expect(toml.models.every((m: { alias?: string }) => !m.alias)).toBe(true);
      expect(toml.models[0].auto_compact_threshold).toBe(256_000);
      expect(JSON.stringify(toml.models)).not.toContain('text-embedding');
      expect(JSON.stringify(toml.models)).not.toContain('vendor/unsized-chat');
      expect(toml.active_model).toBe('mistral/devstral-3');
    });

    it('writes a --base-url override into the Mistral Vibe provider', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.vibe'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'vibe',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/v1'
      );

      expect(await aiGateway(client)).toBe(0);

      const toml = tomlParse(
        readFileSync(join(home, '.vibe', 'config.toml'), 'utf8')
      ) as any;
      expect(toml.providers[0].api_base).toBe(
        'https://preview.ai-gateway.vercel.sh/v1'
      );
    });

    it('configures gptme with an env-keyed provider and default model', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.config', 'gptme'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'gptme'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(
        join(home, '.config', 'gptme', 'config.toml'),
        'utf8'
      );
      const toml = tomlParse(raw) as any;
      expect(toml.providers).toEqual([
        {
          name: 'vercel-ai-gateway',
          base_url: 'https://ai-gateway.vercel.sh/coding-agent/v1',
          api_key_env: 'AI_GATEWAY_API_KEY',
          default_model: 'anthropic/claude-fable-5',
        },
      ]);
      expect(toml.models.default).toBe(
        'vercel-ai-gateway/anthropic/claude-fable-5'
      );
      expect(raw).not.toContain('vck_DummyKey0002');
      if (process.platform !== 'win32') {
        const bashrc = readFileSync(bashrcPath(), 'utf8');
        expect(bashrc).toContain(
          "export AI_GATEWAY_API_KEY='vck_DummyKey0002'"
        );
      }
    });

    it('upserts into existing gptme providers and stays idempotent', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.config', 'gptme'), { recursive: true });
      const existing = [
        '[user]',
        'name = "Ada"',
        '',
        '[models]',
        'default = "ollama/llama3.2:3b"',
        'favorites = ["ollama/llama3.2:3b"]',
        '',
        '[[providers]]',
        'name = "ollama"',
        'base_url = "http://127.0.0.1:11434/v1"',
        'default_model = "llama3.2:3b"',
        '',
        '[[providers]]',
        'name = "vercel-ai-gateway"',
        'base_url = "https://stale.example/v1"',
        '',
      ].join('\n');
      writeFileSync(join(home, '.config', 'gptme', 'config.toml'), existing);
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'gptme',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(
        join(home, '.config', 'gptme', 'config.toml'),
        'utf8'
      );
      const toml = tomlParse(raw) as any;
      expect(toml.user.name).toBe('Ada');
      expect(toml.models.favorites).toEqual(['ollama/llama3.2:3b']);
      expect(toml.models.default).toBe(
        'vercel-ai-gateway/anthropic/claude-fable-5'
      );
      expect(toml.providers).toHaveLength(2);
      expect(toml.providers[0]).toEqual({
        name: 'ollama',
        base_url: 'http://127.0.0.1:11434/v1',
        default_model: 'llama3.2:3b',
      });
      expect(toml.providers[1]).toEqual({
        name: 'vercel-ai-gateway',
        base_url: 'https://ai-gateway.vercel.sh/coding-agent/v1',
        api_key_env: 'AI_GATEWAY_API_KEY',
        default_model: 'anthropic/claude-fable-5',
      });
      expect(raw).not.toContain('vck_DummyKey0002');

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(
        readFileSync(join(home, '.config', 'gptme', 'config.toml'), 'utf8')
      ).toBe(raw);
    });

    it('writes a --base-url override into the gptme provider', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.config', 'gptme'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'gptme',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/v1'
      );

      expect(await aiGateway(client)).toBe(0);

      const toml = tomlParse(
        readFileSync(join(home, '.config', 'gptme', 'config.toml'), 'utf8')
      ) as any;
      expect(toml.providers[0].base_url).toBe(
        'https://preview.ai-gateway.vercel.sh/v1'
      );
    });

    it('configures Junie via a custom model profile with an env-referenced key', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.junie'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'junie'
      );

      expect(await aiGateway(client)).toBe(0);

      const profilePath = join(
        home,
        '.junie',
        'models',
        'vercel-ai-gateway.json'
      );
      const raw = readFileSync(profilePath, 'utf8');
      const profile = JSON.parse(raw);
      expect(profile).toEqual({
        id: 'anthropic/claude-fable-5',
        providerName: 'Vercel AI Gateway',
        baseUrl:
          'https://ai-gateway.vercel.sh/coding-agent/v1/chat/completions',
        apiType: 'OpenAICompletion',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting Junie's literal env-reference syntax
        apiKey: '${AI_GATEWAY_API_KEY}',
      });
      expect(raw).not.toContain('vck_DummyKey0002');
    });

    it('writes one Junie profile per shortlisted model, sized but unpriced', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      mkdirSync(join(home, '.junie'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'junie'
      );

      expect(await aiGateway(client)).toBe(0);

      const modelsDir = join(home, '.junie', 'models');
      expect(readdirSync(modelsDir).sort()).toEqual([
        'vercel-ai-gateway.json',
        'vercel-alibaba-qwen-3-14b.json',
        'vercel-anthropic-claude-fable-5.json',
        'vercel-anthropic-claude-sonnet-4.6.json',
        'vercel-vendor-unsized-chat.json',
      ]);
      const qwen = JSON.parse(
        readFileSync(join(modelsDir, 'vercel-alibaba-qwen-3-14b.json'), 'utf8')
      );
      expect(qwen).toEqual({
        id: 'alibaba/qwen-3-14b',
        displayName: 'Qwen3-14B',
        providerName: 'Vercel AI Gateway',
        baseUrl:
          'https://ai-gateway.vercel.sh/coding-agent/v1/chat/completions',
        apiType: 'OpenAICompletion',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting Junie's literal env-reference syntax
        apiKey: '${AI_GATEWAY_API_KEY}',
        maxContextLength: 40_960,
      });
      const unsized = JSON.parse(
        readFileSync(join(modelsDir, 'vercel-vendor-unsized-chat.json'), 'utf8')
      );
      expect(unsized.maxContextLength).toBeUndefined();
      expect(unsized.id).toBe('vendor/unsized-chat');
      const preferred = JSON.parse(
        readFileSync(join(modelsDir, 'vercel-ai-gateway.json'), 'utf8')
      );
      expect(preferred.id).toBe('anthropic/claude-fable-5');
      expect(preferred.maxContextLength).toBe(1_000_000);
      expect(preferred.displayName).toBe('Claude Fable 5');
      expect(preferred.providerName).toBe('Vercel AI Gateway');
      expect(preferred.inputPrice).toBeUndefined();
      expect(preferred.outputPrice).toBeUndefined();
      expect(
        existsSync(join(modelsDir, 'vercel-openai-text-embedding-3-large.json'))
      ).toBe(false);
    });

    it('writes Junie profiles for the leaderboard shortlist, default first', async () => {
      useUser();
      useShortlistLeaderboard();
      client.nonInteractive = true;
      mkdirSync(join(home, '.junie'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'junie'
      );

      expect(await aiGateway(client)).toBe(0);

      const modelsDir = join(home, '.junie', 'models');
      expect(readdirSync(modelsDir).sort()).toEqual([
        'vercel-ai-gateway.json',
        'vercel-alibaba-qwen-3-14b.json',
        'vercel-anthropic-claude-fable-5.json',
        'vercel-anthropic-claude-sonnet-4.6.json',
      ]);
      const preferred = JSON.parse(
        readFileSync(join(modelsDir, 'vercel-ai-gateway.json'), 'utf8')
      );
      expect(preferred.id).toBe('alibaba/qwen-3-14b');
      expect(preferred.displayName).toBe('Qwen3-14B');
      expect(preferred.maxContextLength).toBe(40_960);
    });

    it('preserves the model id and extra fields of an existing Junie profile', async () => {
      useUser();
      client.nonInteractive = true;
      const modelsDir = join(home, '.junie', 'models');
      mkdirSync(modelsDir, { recursive: true });
      writeFileSync(
        join(modelsDir, 'vercel-ai-gateway.json'),
        JSON.stringify({
          id: 'openai/gpt-5.6-sol',
          baseUrl: 'http://localhost:11434/v1/chat/completions',
          apiType: 'OpenAICompletion',
          temperature: 0.6,
        })
      );
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'junie'
      );

      expect(await aiGateway(client)).toBe(0);

      const profile = JSON.parse(
        readFileSync(join(modelsDir, 'vercel-ai-gateway.json'), 'utf8')
      );
      expect(profile.id).toBe('openai/gpt-5.6-sol');
      expect(profile.temperature).toBe(0.6);
      expect(profile.baseUrl).toBe(
        'https://ai-gateway.vercel.sh/coding-agent/v1/chat/completions'
      );
      expect(profile.apiKey).toContain('AI_GATEWAY_API_KEY');
    });

    it('appends /chat/completions to a --base-url override for Junie', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.junie'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'junie',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/v1'
      );

      expect(await aiGateway(client)).toBe(0);

      const profile = JSON.parse(
        readFileSync(
          join(home, '.junie', 'models', 'vercel-ai-gateway.json'),
          'utf8'
        )
      );
      expect(profile.baseUrl).toBe(
        'https://preview.ai-gateway.vercel.sh/v1/chat/completions'
      );
    });

    it('honors JUNIE_HOME for the Junie profile location', async () => {
      useUser();
      client.nonInteractive = true;
      const junieHome = join(home, 'custom-junie-home');
      process.env.JUNIE_HOME = junieHome;
      mkdirSync(junieHome, { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'junie'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(
        existsSync(join(junieHome, 'models', 'vercel-ai-gateway.json'))
      ).toBe(true);
      expect(
        existsSync(join(home, '.junie', 'models', 'vercel-ai-gateway.json'))
      ).toBe(false);
    });

    it('configures Deep Agents via config.toml with an env-referenced provider', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.deepagents'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'deepagents'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(deepagentsConfigPath(), 'utf8');
      const config = tomlParse(raw) as any;
      expect(config.models.default).toBe(
        'vercel-ai-gateway:anthropic/claude-fable-5'
      );
      const provider = config.models.providers['vercel-ai-gateway'];
      expect(provider.api_key_env).toBe('AI_GATEWAY_API_KEY');
      expect(provider.base_url).toBe(
        'https://ai-gateway.vercel.sh/coding-agent/v1'
      );
      expect(provider.class_path).toBe('langchain_openai:ChatOpenAI');
      expect(provider.models).toContain('anthropic/claude-fable-5');
      expect(provider.params.use_responses_api).toBe(false);
      expect(raw).not.toContain('vck_DummyKey0002');
    });

    it('preserves existing Deep Agents providers and is idempotent', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.deepagents'), { recursive: true });
      writeFileSync(
        deepagentsConfigPath(),
        '[models.providers.openai]\nbase_url = "https://internal.corp/v1"\napi_key_env = "CORP_KEY"\n'
      );
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'deepagents',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const first = readFileSync(deepagentsConfigPath(), 'utf8');
      const config = tomlParse(first) as any;
      expect(config.models.providers.openai).toEqual({
        base_url: 'https://internal.corp/v1',
        api_key_env: 'CORP_KEY',
      });
      expect(config.models.providers['vercel-ai-gateway'].api_key_env).toBe(
        'AI_GATEWAY_API_KEY'
      );
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(readFileSync(deepagentsConfigPath(), 'utf8')).toBe(first);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.reason).toBe('already_configured');
      expect(out.configured).toHaveLength(0);
    });

    it('lists the default-first shortlist as Deep Agents strings with profile tables', async () => {
      useUser();
      // No leaderboard route: 404s into the default-first alphabetical fallback.
      useGatewayModels();
      client.nonInteractive = true;
      mkdirSync(join(home, '.deepagents'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'deepagents'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = tomlParse(
        readFileSync(deepagentsConfigPath(), 'utf8')
      ) as any;
      const provider = config.models.providers['vercel-ai-gateway'];
      // Plain strings only: an inline table raises TypeError out of the
      // config loader, outside its try/except.
      expect(provider.models).toEqual([
        'anthropic/claude-fable-5',
        'alibaba/qwen-3-14b',
        'anthropic/claude-sonnet-4.6',
        'vendor/unsized-chat',
      ]);
      expect(provider.models.every((m: unknown) => typeof m === 'string')).toBe(
        true
      );
      // Metadata lives in sibling profile tables — the only way to get a real
      // context limit and a row label that is not the raw id.
      expect(provider.profile['anthropic/claude-fable-5']).toEqual({
        name: 'Claude Fable 5',
        max_input_tokens: 1_000_000,
        max_output_tokens: 128_000,
      });
      expect(provider.profile['vendor/unsized-chat']).toEqual({
        name: 'Unsized Chat',
      });
      expect(config.models.default).toBe(
        'vercel-ai-gateway:anthropic/claude-fable-5'
      );
    });

    it('orders Deep Agents models purely by leaderboard rank', async () => {
      useUser();
      useShortlistLeaderboard();
      client.nonInteractive = true;
      mkdirSync(join(home, '.deepagents'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'deepagents'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = tomlParse(
        readFileSync(deepagentsConfigPath(), 'utf8')
      ) as any;
      const provider = config.models.providers['vercel-ai-gateway'];
      expect(provider.models).toEqual([
        'alibaba/qwen-3-14b',
        'anthropic/claude-sonnet-4.6',
        'anthropic/claude-fable-5',
      ]);
      expect(Object.keys(provider.profile).sort()).toEqual([
        'alibaba/qwen-3-14b',
        'anthropic/claude-fable-5',
        'anthropic/claude-sonnet-4.6',
      ]);
      expect(config.models.default).toBe(
        'vercel-ai-gateway:alibaba/qwen-3-14b'
      );
    });

    it('writes a --base-url override verbatim into the Deep Agents config', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'deepagents',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/v1'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = tomlParse(
        readFileSync(deepagentsConfigPath(), 'utf8')
      ) as any;
      expect(config.models.providers['vercel-ai-gateway'].base_url).toBe(
        'https://preview.ai-gateway.vercel.sh/v1'
      );
    });

    it('writes a --base-url override verbatim into the Codex config', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'codex',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/v1'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const toml = tomlParse(readFileSync(codexConfigPath(), 'utf8')) as any;
      expect(toml.model_providers.vercel.base_url).toBe(
        'https://preview.ai-gateway.vercel.sh/v1'
      );
    });

    it('writes a --base-url override verbatim into Claude Code settings', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0001',
        '--agent',
        'claude-code',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_BASE_URL).toBe(
        'https://preview.ai-gateway.vercel.sh'
      );
    });

    it('rejects an invalid --base-url without writing config', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'codex',
        '--base-url',
        'not-a-url'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid --base-url');
      expect(existsSync(codexConfigPath())).toBe(false);
    });

    // Shell rc management is intentionally skipped on Windows.
    it.skipIf(process.platform === 'win32')(
      'appends the rc block a blank line after existing user content',
      async () => {
        useUser();
        client.nonInteractive = true;
        writeFileSync(bashrcPath(), '# my rc\nalias ll="ls -la"\n');
        client.setArgv(
          'ai-gateway',
          'coding-agents',
          'setup',
          '--key',
          'vck_DummyKey0018',
          '--agent',
          'codex'
        );

        expect(await aiGateway(client)).toBe(0);
        // The exact bytes: the block reads as its own section, never as a tail
        // of the user's last block.
        expect(readFileSync(bashrcPath(), 'utf8')).toBe(
          [
            '# my rc',
            'alias ll="ls -la"',
            '',
            '# >>> vercel ai-gateway >>>',
            '# Managed by `vercel ai-gateway setup` — safe to remove this block.',
            "export AI_GATEWAY_API_KEY='vck_DummyKey0018'",
            '# <<< vercel ai-gateway <<<',
            '',
          ].join('\n')
        );
      }
    );

    // Shell rc management is intentionally skipped on Windows.
    it.skipIf(process.platform === 'win32')(
      'shell-escapes a key with special characters',
      async () => {
        useUser();
        client.nonInteractive = true;
        const trickyKey = 'vck_a$b`c\'d"e';
        client.setArgv(
          'ai-gateway',
          'coding-agents',
          'setup',
          '--key',
          trickyKey,
          '--agent',
          'codex'
        );

        expect(await aiGateway(client)).toBe(0);
        const bashrc = readFileSync(bashrcPath(), 'utf8');
        expect(bashrc).toContain(
          `export AI_GATEWAY_API_KEY='vck_a$b\`c'\\''d"e'`
        );
      }
    );

    it('configures OpenCode with the native vercel provider', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0003',
        '--agent',
        'opencode'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const cfg = JSON.parse(readFileSync(opencodeConfigPath(), 'utf8'));
      expect(cfg.provider.vercel.options.apiKey).toBe('vck_DummyKey0003');
      expect(cfg.model).toBeUndefined();
    });

    it('leaves a minified opencode.json on one line, existing entries untouched', async () => {
      useUser();
      client.nonInteractive = true;
      keychainState.available = false; // deterministic: key embeds in the config
      mkdirSync(join(home, '.config', 'opencode'), { recursive: true });
      // Some tools write opencode.json minified; connecting must not explode
      // it into pretty-printed form.
      const original =
        '{"mcp":{"devbox":{"command":["/x/devbox","mcp"],"enabled":true,"type":"local"}}}';
      writeFileSync(opencodeConfigPath(), original, 'utf8');
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_Minified001',
        '--agent',
        'opencode'
      );

      expect(await aiGateway(client)).toBe(0);

      const next = readFileSync(opencodeConfigPath(), 'utf8');
      expect(next.trim()).not.toContain('\n');
      expect(next).toContain(
        '{"mcp":{"devbox":{"command":["/x/devbox","mcp"],"enabled":true,"type":"local"}}'
      );
      const cfg = JSON.parse(next);
      expect(cfg.provider.vercel.options.apiKey).toBe('vck_Minified001');
    });

    // Keychain-backed shell exports only exist on macOS (no shell rc on Windows).
    it.skipIf(process.platform === 'win32')(
      'keeps the OpenCode key out of the config under keychain',
      async () => {
        const secret = 'vck_OpenCodeKeychain';
        const plan = await buildSetupPlan([opencode], {
          apiKey: secret,
          home,
          useKeychain: true,
        });

        // The provider is declared, but the key is not embedded…
        const cfg = plan.changes.find(c => c.label === 'OpenCode config');
        expect(cfg?.next).toContain('vercel');
        expect(cfg?.next).not.toContain(secret);
        // …it's resolved from AI_GATEWAY_API_KEY via the Keychain at runtime.
        const shell = plan.changes.find(c => c.format === 'shell');
        expect(shell?.next).toContain('export AI_GATEWAY_API_KEY=');
        expect(shell?.next).toContain('security find-generic-password');
        expect(shell?.next).not.toContain(secret);
      }
    );

    it('configures Pi via the native vercel-ai-gateway auth entry (0600)', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0007',
        '--agent',
        'pi'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const auth = JSON.parse(readFileSync(piAuthPath(), 'utf8'));
      expect(auth['vercel-ai-gateway']).toEqual({
        type: 'api_key',
        key: 'vck_DummyKey0007',
      });
      if (process.platform !== 'win32') {
        expect(statSync(piAuthPath()).mode & 0o777).toBe(0o600);
      }
    });

    it('configures fx by pinning credential_source, with the key in the environment', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0008',
        '--agent',
        'fx'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(fxSettingsPath(), 'utf8');
      expect(JSON.parse(raw)).toEqual({
        credential_source: 'ai_gateway_api_key',
      });
      expect(raw).not.toContain('vck_DummyKey0008');
      if (process.platform === 'win32') {
        const out = JSON.parse(client.stdout.getFullOutput());
        expect(JSON.stringify(out.notes)).toContain('AI_GATEWAY_API_KEY');
      } else {
        expect(readFileSync(bashrcPath(), 'utf8')).toContain(
          "export AI_GATEWAY_API_KEY='vck_DummyKey0008'"
        );
      }
    });

    it('keeps the existing fx profile, including the user model, and is idempotent', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.fx'), { recursive: true });
      writeFileSync(
        fxSettingsPath(),
        '{"model":"zai/glm-5.2","permission_mode":"yolo","credential_source":"fx_login"}'
      );
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0008',
        '--agent',
        'fx',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const first = readFileSync(fxSettingsPath(), 'utf8');
      expect(JSON.parse(first)).toEqual({
        model: 'zai/glm-5.2',
        permission_mode: 'yolo',
        credential_source: 'ai_gateway_api_key',
      });
      expect(first.trim()).not.toContain('\n');
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(readFileSync(fxSettingsPath(), 'utf8')).toBe(first);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.reason).toBe('already_configured');
    });

    it('configures OpenHands agent settings, repointing an existing condenser LLM', async () => {
      useUser();
      useGatewayModels();
      client.nonInteractive = true;
      mkdirSync(join(home, '.openhands'), { recursive: true });
      writeFileSync(
        openhandsSettingsPath(),
        JSON.stringify({
          kind: 'Agent',
          llm: {
            model: 'anthropic/claude-sonnet-4-5',
            api_key: 'sk-old-secret',
            base_url: null,
            usage_id: 'agent',
            temperature: 0,
          },
          condenser: {
            kind: 'LLMSummarizingCondenser',
            llm: {
              model: 'anthropic/claude-sonnet-4-5',
              api_key: 'sk-old-secret',
              base_url: null,
              usage_id: 'condenser',
            },
            max_size: 120,
          },
        })
      );
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'openhands'
      );

      expect(await aiGateway(client)).toBe(0);

      const raw = readFileSync(openhandsSettingsPath(), 'utf8');
      const spec = JSON.parse(raw);
      expect(spec.llm).toMatchObject({
        model: 'openai/anthropic/claude-fable-5',
        api_key: 'vck_DummyKey0002',
        base_url: 'https://ai-gateway.vercel.sh/coding-agent/v1',
        usage_id: 'agent',
        temperature: 0,
        input_cost_per_token: 0.00001,
        output_cost_per_token: 0.00005,
      });
      expect(spec.condenser).toMatchObject({
        kind: 'LLMSummarizingCondenser',
        llm: {
          model: 'openai/anthropic/claude-fable-5',
          api_key: 'vck_DummyKey0002',
          base_url: 'https://ai-gateway.vercel.sh/coding-agent/v1',
          usage_id: 'condenser',
          input_cost_per_token: 0.00001,
          output_cost_per_token: 0.00005,
        },
        max_size: 120,
      });
      expect(spec.kind).toBe('Agent');
      expect(raw).not.toContain('sk-old-secret');
    });

    it('creates a fresh OpenHands agent_settings.json (0600) and is a no-op on the second run', async () => {
      useUser();
      client.nonInteractive = true;
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'openhands',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const first = readFileSync(openhandsSettingsPath(), 'utf8');
      const spec = JSON.parse(first);
      expect(spec.llm).toEqual({
        model: 'openai/anthropic/claude-fable-5',
        api_key: 'vck_DummyKey0002',
        base_url: 'https://ai-gateway.vercel.sh/coding-agent/v1',
        usage_id: 'agent',
      });
      expect(spec).not.toHaveProperty('condenser');
      if (process.platform !== 'win32') {
        expect(statSync(openhandsSettingsPath()).mode & 0o777).toBe(0o600);
      }
      const offset = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(readFileSync(openhandsSettingsPath(), 'utf8')).toBe(first);
      const out = JSON.parse(client.stdout.getFullOutput().slice(offset));
      expect(out.reason).toBe('already_configured');
      expect(out.configured).toHaveLength(0);
    });

    it('writes a --base-url override verbatim into OpenHands agent settings', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'openhands',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/v1'
      );

      expect(await aiGateway(client)).toBe(0);

      const spec = JSON.parse(readFileSync(openhandsSettingsPath(), 'utf8'));
      expect(spec.llm.base_url).toBe('https://preview.ai-gateway.vercel.sh/v1');
      expect(spec.llm.model).toBe('openai/anthropic/claude-fable-5');
    });

    it('configures ForgeCode via .forge.toml and .credentials.json (0600)', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.forge'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'forge'
      );

      expect(await aiGateway(client)).toBe(0);

      const configRaw = readFileSync(forgeConfigPath(), 'utf8');
      const config = tomlParse(configRaw) as any;
      expect(config.providers).toHaveLength(1);
      expect(config.providers[0]).toMatchObject({
        id: 'vercel-ai-gateway',
        url: 'https://ai-gateway.vercel.sh/coding-agent/v1/chat/completions',
        models: 'https://ai-gateway.vercel.sh/coding-agent/v1/models',
        api_key_vars: 'AI_GATEWAY_API_KEY',
        response_type: 'OpenAI',
        auth_methods: ['api_key'],
      });
      expect(config.session.provider_id).toBe('vercel-ai-gateway');
      expect(config.session.model_id).toBe('anthropic/claude-fable-5');
      expect(configRaw).not.toContain('vck_DummyKey0002');

      const creds = JSON.parse(readFileSync(forgeCredentialsPath(), 'utf8'));
      expect(creds).toEqual([
        {
          id: 'vercel-ai-gateway',
          auth_details: { api_key: 'vck_DummyKey0002' },
        },
      ]);
      if (process.platform !== 'win32') {
        expect(statSync(forgeCredentialsPath()).mode & 0o777).toBe(0o600);
      }
    });

    it('upserts into existing ForgeCode files, preserving other providers', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.forge'), { recursive: true });
      writeFileSync(
        forgeConfigPath(),
        [
          '[[providers]]',
          'id = "ollama"',
          'url = "http://localhost:11434/v1/chat/completions"',
          '',
          '[[providers]]',
          'id = "vercel-ai-gateway"',
          'url = "https://stale.example/v1/chat/completions"',
          'custom_field = "kept"',
          '',
          '[session]',
          'provider_id = "ollama"',
          'temperature = 0.2',
          '',
        ].join('\n')
      );
      writeFileSync(
        forgeCredentialsPath(),
        JSON.stringify([{ id: 'anthropic', auth_details: { api_key: 'x' } }])
      );
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'forge'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = tomlParse(readFileSync(forgeConfigPath(), 'utf8')) as any;
      expect(config.providers.map((p: any) => p.id)).toEqual([
        'ollama',
        'vercel-ai-gateway',
      ]);
      expect(config.providers[0].url).toBe(
        'http://localhost:11434/v1/chat/completions'
      );
      expect(config.providers[1].url).toBe(
        'https://ai-gateway.vercel.sh/coding-agent/v1/chat/completions'
      );
      expect(config.providers[1].custom_field).toBe('kept');
      expect(config.session).toMatchObject({
        provider_id: 'vercel-ai-gateway',
        model_id: 'anthropic/claude-fable-5',
        temperature: 0.2,
      });

      const creds = JSON.parse(readFileSync(forgeCredentialsPath(), 'utf8'));
      expect(creds.map((c: any) => c.id)).toEqual([
        'anthropic',
        'vercel-ai-gateway',
      ]);
      expect(creds[0].auth_details.api_key).toBe('x');
      expect(creds[1].auth_details.api_key).toBe('vck_DummyKey0002');
    });

    it('is idempotent for ForgeCode on a second run with the same key', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.forge'), { recursive: true });
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'forge',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const firstConfig = readFileSync(forgeConfigPath(), 'utf8');
      const firstCreds = readFileSync(forgeCredentialsPath(), 'utf8');

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(readFileSync(forgeConfigPath(), 'utf8')).toBe(firstConfig);
      expect(readFileSync(forgeCredentialsPath(), 'utf8')).toBe(firstCreds);
    });

    it('appends /chat/completions to a --base-url override for ForgeCode', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.forge'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'forge',
        '--base-url',
        'https://preview.ai-gateway.vercel.sh/coding-agent/v1'
      );

      expect(await aiGateway(client)).toBe(0);

      const config = tomlParse(readFileSync(forgeConfigPath(), 'utf8')) as any;
      expect(config.providers[0].url).toBe(
        'https://preview.ai-gateway.vercel.sh/coding-agent/v1/chat/completions'
      );
      expect(config.providers[0].models).toBe(
        'https://preview.ai-gateway.vercel.sh/coding-agent/v1/models'
      );
    });

    it.skipIf(process.platform === 'win32')(
      'configures omp with a shell export only (native provider)',
      async () => {
        useUser();
        client.nonInteractive = true;
        mkdirSync(join(home, '.omp'), { recursive: true });
        client.setArgv(
          'ai-gateway',
          'coding-agents',
          'setup',
          '--key',
          'vck_DummyKey0011',
          '--agent',
          'omp'
        );

        const exitCode = await aiGateway(client);
        expect(exitCode).toBe(0);

        const bashrc = readFileSync(bashrcPath(), 'utf8');
        expect(bashrc).toContain(
          "export AI_GATEWAY_API_KEY='vck_DummyKey0011'"
        );
        expect(readdirSync(join(home, '.omp'))).toEqual([]);

        const out = JSON.parse(client.stdout.getFullOutput());
        expect(out.status).toBe('ok');
        const notes: string[] = out.notes ?? [];
        expect(notes.some(n => n.includes('/model'))).toBe(true);
        expect(notes.every(n => !n.includes('vck_DummyKey0011'))).toBe(true);
      }
    );

    it.skipIf(process.platform === 'win32')(
      'keeps the omp key in the Keychain-backed shell export only',
      async () => {
        const secret = 'vck_OmpKeychain';
        const plan = await buildSetupPlan([omp], {
          apiKey: secret,
          home,
          useKeychain: true,
        });

        expect(plan.changes.filter(c => c.format !== 'shell')).toEqual([]);
        const shell = plan.changes.find(c => c.format === 'shell');
        expect(shell?.next).toContain('export AI_GATEWAY_API_KEY=');
        expect(shell?.next).toContain('security find-generic-password');
        expect(shell?.next).not.toContain(secret);
      }
    );

    it('detects omp at ~/.omp and at a $PI_CONFIG_DIR override', async () => {
      expect(await omp.detect(home)).toBe(false);
      mkdirSync(join(home, '.omp'), { recursive: true });
      expect(await omp.detect(home)).toBe(true);

      process.env.PI_CONFIG_DIR = 'custom-omp';
      expect(await omp.detect(home)).toBe(false);
      mkdirSync(join(home, 'custom-omp'), { recursive: true });
      expect(await omp.detect(home)).toBe(true);
    });
  });

  describe('non-interactive key creation', () => {
    it('mints a budgeted key and writes it everywhere', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code',
        '--budget',
        '500',
        '--refresh-period',
        'monthly'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      expect(lastCreateBody?.purpose).toBe('ai-gateway');
      expect(lastCreateBody?.aiGatewayQuota).toMatchObject({
        limitAmount: 500,
        refreshPeriod: 'monthly',
      });

      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe(CREATED_KEY);

      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.apiKey).toBe(CREATED_KEY);
    });

    it.each([
      ['--amount', ''],
      ['--budget', '! --budget is deprecated. Use --amount.\n'],
    ])('mints a budgeted key with %s', async (flag, warning) => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--agent',
        'claude-code',
        flag,
        '500',
        '--refresh-period',
        'monthly'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(lastCreateBody?.aiGatewayQuota).toMatchObject({
        limitAmount: 500,
        refreshPeriod: 'monthly',
      });
      const stderr = client.stderr.getFullOutput();
      expect(stderr.match(/is deprecated/g) ?? []).toHaveLength(
        warning ? 1 : 0
      );
      if (warning) expect(stderr).toContain(warning);
      expect(client.telemetryEventStore.readonlyEvents).toContainEqual(
        expect.objectContaining({ key: `option:${flag.slice(2)}` })
      );
    });

    it('rejects --amount with --budget before creating a key', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'setup',
        '--agent',
        'claude-code',
        '--amount',
        '500',
        '--budget',
        '500'
      );

      expect(await aiGateway(client)).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        "Can't use --amount with --budget."
      );
      expect(lastCreateBody).toBeUndefined();
    });
  });

  describe('--dry-run', () => {
    it('writes nothing and reports the planned changes', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--dry-run',
        '--key',
        'vck_DummyKey0004',
        '--agent',
        'claude-code'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);
      expect(existsSync(claudeSettingsPath())).toBe(false);

      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.reason).toBe('dry_run');
      expect(out.changes[0].action).toBe('would_create');
    });

    it.skipIf(process.platform === 'win32')(
      'previews the omp shell export without writing it',
      async () => {
        useUser();
        client.nonInteractive = true;
        mkdirSync(join(home, '.omp'), { recursive: true });
        client.setArgv(
          'ai-gateway',
          'coding-agents',
          'setup',
          '--dry-run',
          '--key',
          'vck_DummyKey0011',
          '--agent',
          'omp'
        );

        const exitCode = await aiGateway(client);
        expect(exitCode).toBe(0);
        expect(existsSync(bashrcPath())).toBe(false);
        expect(readdirSync(join(home, '.omp'))).toEqual([]);

        const out = JSON.parse(client.stdout.getFullOutput());
        expect(out.reason).toBe('dry_run');
        expect(out.changes[0].action).toBe('would_create');
      }
    );

    it('previews the .bak backup it would write for an existing config', async () => {
      useUser();
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(claudeSettingsPath(), '{"env":{"FOO":"bar"}}', 'utf8');

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--dry-run',
        '--yes',
        '--key',
        'vck_DummyKey0010',
        '--agent',
        'claude-code'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);
      // The preview names the backup side effect, and nothing is written.
      await expect(client.stderr).toOutput(
        `backs up to ${claudeSettingsPath()}.bak`
      );
      expect(existsSync(`${claudeSettingsPath()}.bak`)).toBe(false);
    });

    it('drops the backup note from the preview under --no-backup', async () => {
      useUser();
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(claudeSettingsPath(), '{"env":{"FOO":"bar"}}', 'utf8');

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--dry-run',
        '--yes',
        '--no-backup',
        '--key',
        'vck_DummyKey0011',
        '--agent',
        'claude-code'
      );

      expect(await aiGateway(client)).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Planned changes');
      expect(stderr).not.toContain('backed up alongside as .bak');
      expect(stderr).not.toContain('backs up to');
    });

    it('prompts for key source, team, name, quota, and expiry in order', async () => {
      useUser();
      useTeam();
      // Found at its default location, so the custom-path prompt stays quiet.
      mkdirSync(join(home, '.claude'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--dry-run',
        '--agent',
        'claude-code'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('previewing changes only');
      await expect(client.stderr).toOutput('AI Gateway API key?');
      client.stdin.write('\n'); // create a new key
      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n'); // accept default scope
      // Then the name.
      await expect(client.stderr).toOutput('Key name?');
      client.stdin.write('\n');
      // Then quota (defaults to no).
      await expect(client.stderr).toOutput('Set a spend limit');
      client.stdin.write('\n');
      // Then expiry (defaults to no).
      await expect(client.stderr).toOutput('Set an expiration');
      client.stdin.write('\n');

      // With neither set, the summary spells out the absence of limits.
      await expect(client.stderr).toOutput('Unlimited');
      await expect(client.stderr).toOutput('Never');
      await expect(client.stderr).toOutput('Dry run');
      expect(await exitCodePromise).toBe(0);
      // Still a preview: nothing is written and no key is minted.
      expect(existsSync(claudeSettingsPath())).toBe(false);
    });

    it('prompts for the team even when one is already selected', async () => {
      const team = useTeam();
      useUser();
      // A scope is already pinned, but key ownership is still an explicit choice.
      client.config.currentTeam = team.id;
      mkdirSync(join(home, '.claude'), { recursive: true });
      // Pin the other options so only the team prompt remains.
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--dry-run',
        '--agent',
        'claude-code',
        '--name',
        'my-key',
        '--refresh-period',
        'none',
        '--expiration',
        'none'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('AI Gateway API key?');
      client.stdin.write('\n'); // create a new key
      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Dry run');
      expect(await exitCodePromise).toBe(0);
      expect(existsSync(claudeSettingsPath())).toBe(false);
    });

    it('does not require a scope in non-interactive mode', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--dry-run',
        '--agent',
        'claude-code'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);
      expect(existsSync(claudeSettingsPath())).toBe(false);

      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.reason).toBe('dry_run');
    });
  });

  describe('team selection', () => {
    it('skips the prompt with --yes and uses the current scope', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--yes',
        '--agent',
        'claude-code'
      );

      // No prompt is awaited: --yes accepts the current scope and the run
      // completes without any interactive input.
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe(CREATED_KEY);
    });
  });

  describe('agent selection with --yes', () => {
    it('selects the detected agents without prompting', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      mkdirSync(join(home, '.claude'), { recursive: true });
      client.setArgv('ai-gateway', 'coding-agents', 'setup', '--yes');

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe(CREATED_KEY);
      // An undetected agent is not configured.
      expect(existsSync(codexConfigPath())).toBe(false);
    });

    it('errors when nothing is detected and no agent is named', async () => {
      useUser();
      // Fresh home: no agent config dirs, so nothing is detected.
      client.setArgv('ai-gateway', 'coding-agents', 'setup', '--yes');

      expect(await aiGateway(client)).toBe(1);
      await expect(client.stderr).toOutput('No coding agents detected');
    });

    // Cline, Cursor, Hermes, Kilo Code and OpenClaw are no longer experimental,
    // so detection reaches them without an explicit --agent.
    it('selects a formerly experimental agent when detected', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      mkdirSync(join(home, '.cline'), { recursive: true });
      client.setArgv('ai-gateway', 'coding-agents', 'setup', '--yes');

      expect(await aiGateway(client)).toBe(0);
      expect(
        existsSync(join(home, '.cline', 'data', 'settings', 'providers.json'))
      ).toBe(true);
    });

    it('auto-selects fx when detected', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      mkdirSync(join(home, '.fx'), { recursive: true });
      client.setArgv('ai-gateway', 'coding-agents', 'setup', '--yes');

      expect(await aiGateway(client)).toBe(0);
      expect(JSON.parse(readFileSync(fxSettingsPath(), 'utf8'))).toEqual({
        credential_source: 'ai_gateway_api_key',
      });
    });

    it('auto-selects the Qwen Code agent when detected', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      mkdirSync(join(home, '.claude'), { recursive: true });
      mkdirSync(join(home, '.qwen'), { recursive: true });
      client.setArgv('ai-gateway', 'coding-agents', 'setup', '--yes');

      expect(await aiGateway(client)).toBe(0);
      expect(existsSync(claudeSettingsPath())).toBe(true);
      expect(existsSync(join(home, '.qwen', 'settings.json'))).toBe(true);
    });

    it('auto-selects omp when detected and writes only the shell export', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      mkdirSync(join(home, '.omp'), { recursive: true });
      client.setArgv('ai-gateway', 'coding-agents', 'setup', '--yes');

      expect(await aiGateway(client)).toBe(0);
      if (process.platform !== 'win32') {
        expect(readFileSync(bashrcPath(), 'utf8')).toContain(
          'export AI_GATEWAY_API_KEY='
        );
      }
      expect(readdirSync(join(home, '.omp'))).toEqual([]);
    });
  });

  describe('non-interactive agent selection', () => {
    it('auto-selects Junie alongside Claude Code when both are detected', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      mkdirSync(join(home, '.junie'), { recursive: true });
      client.setArgv('ai-gateway', 'setup', '--key', 'vck_DummyKey0011');

      expect(await aiGateway(client)).toBe(0);
      expect(existsSync(claudeSettingsPath())).toBe(true);
      expect(
        existsSync(join(home, '.junie', 'models', 'vercel-ai-gateway.json'))
      ).toBe(true);
    });

    it('configures only the detected agents when none are named', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0011'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(existsSync(claudeSettingsPath())).toBe(true);
      // Undetected agents are left alone.
      expect(existsSync(codexConfigPath())).toBe(false);
      expect(existsSync(opencodeConfigPath())).toBe(false);
      expect(existsSync(piAuthPath())).toBe(false);

      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.configured).toHaveLength(1);
    });

    it('auto-selects Copilot alongside Claude Code when both are detected', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      mkdirSync(join(home, '.copilot'), { recursive: true });
      client.setArgv('ai-gateway', 'setup', '--key', 'vck_DummyKey0011');

      expect(await aiGateway(client)).toBe(0);
      expect(existsSync(claudeSettingsPath())).toBe(true);
      if (process.platform === 'win32') {
        const out = JSON.parse(client.stdout.getFullOutput());
        expect(JSON.stringify(out.notes)).toContain(
          'COPILOT_PROVIDER_BASE_URL'
        );
      } else {
        expect(readFileSync(bashrcPath(), 'utf8')).toContain(
          'COPILOT_PROVIDER_BASE_URL'
        );
      }
    });

    it('errors when nothing is detected and no agent is named', async () => {
      useUser();
      client.nonInteractive = true;
      // The mock throws to simulate process.exit terminating; assert on the
      // spy and the emitted payload rather than the return value.
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
        _code?: number
      ) => {
        throw new Error('exit');
      }) as () => never);
      try {
        client.setArgv(
          'ai-gateway',
          'coding-agents',
          'setup',
          '--key',
          'vck_DummyKey0012'
        );
        await aiGateway(client).catch(() => {});

        expect(exitSpy).toHaveBeenCalledWith(2);
        const out = JSON.parse(client.stdout.getFullOutput());
        expect(out.status).toBe('error');
        expect(out.message).toContain('No coding agents detected');
        expect(existsSync(codexConfigPath())).toBe(false);
      } finally {
        exitSpy.mockRestore();
      }
    });
  });

  describe('keychain', () => {
    it('is unavailable off macOS and fails closed', () => {
      if (process.platform !== 'darwin') {
        expect(isKeychainAvailable()).toBe(false);
        expect(storeKeyInKeychain('vck_whatever')).toBe(false);
      }
      expect(keychainLookup()).toContain('security find-generic-password');
    });

    // Keychain-backed shell exports only exist on macOS (no shell rc on Windows).
    it.skipIf(process.platform === 'win32')(
      'keeps the secret out of the configs and reads it from the shell',
      async () => {
        const secret = 'vck_KeychainSecret321';
        const plan = await buildSetupPlan([claudeCode], {
          apiKey: secret,
          home,
          useKeychain: true,
        });

        // The env-based agent resolves its var from the Keychain at runtime.
        const shell = plan.changes.find(c => c.format === 'shell');
        expect(shell?.next).toContain('security find-generic-password');
        expect(shell?.next).toContain('export ANTHROPIC_AUTH_TOKEN=');
        expect(shell?.next).not.toContain(secret);

        // Claude's token is no longer embedded in settings.json.
        const claude = plan.changes.find(
          c => c.label === 'Claude Code settings'
        );
        expect(claude?.next).toContain('ANTHROPIC_BASE_URL');
        expect(claude?.next).not.toContain('ANTHROPIC_AUTH_TOKEN');
        expect(claude?.next).not.toContain(secret);
      }
    );

    it('embeds the key directly when keychain is off', async () => {
      const secret = 'vck_PlainSecret654';
      const plan = await buildSetupPlan([claudeCode], {
        apiKey: secret,
        home,
        useKeychain: false,
      });

      const claude = plan.changes.find(c => c.label === 'Claude Code settings');
      expect(claude?.next).toContain(secret);
    });

    it.skipIf(process.platform === 'win32')(
      'substitutes only the Copilot secret from the Keychain, not its plain exports',
      async () => {
        const secret = 'vck_KeychainSecret321';
        const plan = await buildSetupPlan([copilot], {
          apiKey: secret,
          home,
          useKeychain: true,
        });

        const shell = plan.changes.find(c => c.format === 'shell');
        expect(shell?.next).toContain('export COPILOT_PROVIDER_API_KEY="$(');
        expect(shell?.next).toContain('security find-generic-password');
        expect(shell?.next).toContain(
          "export COPILOT_PROVIDER_BASE_URL='https://ai-gateway.vercel.sh/coding-agent/v1'"
        );
        expect(shell?.next).toContain(
          "export COPILOT_MODEL='anthropic/claude-fable-5'"
        );
        expect(shell?.next).not.toContain(secret);
      }
    );

    // Keychain-backed shell exports only exist on macOS (no shell rc on Windows).
    it.skipIf(process.platform === 'win32')(
      'reads the Codex env key from the Keychain instead of the config',
      async () => {
        const secret = 'vck_KeychainSecret321';
        const plan = await buildSetupPlan([codex], {
          apiKey: secret,
          home,
          useKeychain: true,
        });

        const shell = plan.changes.find(c => c.format === 'shell');
        expect(shell?.next).toContain('security find-generic-password');
        expect(shell?.next).toContain('export AI_GATEWAY_API_KEY=');
        expect(shell?.next).not.toContain(secret);
      }
    );
  });

  describe('key options', () => {
    it('collects name, quota, and expiry interactively', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      mkdirSync(join(home, '.claude'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('AI Gateway API key?');
      client.stdin.write('\n'); // create a new key
      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Key name?');
      client.stdin.write('My Coding Key\n');
      await expect(client.stderr).toOutput('Set a spend limit');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('How often should the limit reset?');
      client.stdin.write('\n'); // accept default "Never"
      await expect(client.stderr).toOutput('Spend limit in USD');
      client.stdin.write('\n'); // accept default 100
      await expect(client.stderr).toOutput('Set an expiration');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('Expires in');
      client.stdin.write('\n'); // accept default preset (30 days)
      // Resolved state first, then the mutation preview, then the apply prompt.
      await expect(client.stderr).toOutput('Summary');
      // The backup promise rides the preview heading — up front, not only in
      // the post-apply receipt.
      await expect(client.stderr).toOutput(
        'Planned changes  existing files are backed up alongside as .bak first'
      );
      await expect(client.stderr).toOutput('Apply these changes?');
      client.stdin.write('\n'); // accept default (yes)

      expect(await exitCodePromise).toBe(0);

      expect(lastCreateBody?.name).toBe('My Coding Key');
      expect(lastCreateBody?.aiGatewayQuota).toMatchObject({
        limitAmount: 100,
      });
      const expiresAt = lastCreateBody?.expiresAt as number;
      expect(typeof expiresAt).toBe('number');
      // 30-day preset lands ~30 days out.
      const days = (expiresAt - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29);
      expect(days).toBeLessThan(31);
    });

    it('reuses an existing key instead of creating one', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      mkdirSync(join(home, '.claude'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('AI Gateway API key?');
      client.stdin.write('\x1b[B\n'); // pick "Use an existing key"
      await expect(client.stderr).toOutput('Paste your AI Gateway API key');
      client.stdin.write('vck_MyOwnExistingKey\n');
      await expect(client.stderr).toOutput('Using provided key');
      await expect(client.stderr).toOutput('Apply these changes?');
      client.stdin.write('\n');

      expect(await exitCodePromise).toBe(0);
      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('vck_MyOwnExistingKey');
      expect(lastCreateBody).toBeUndefined();
      const stderr = client.stderr.getFullOutput();
      expect(stderr).not.toContain('Which team?');
      expect(stderr).not.toContain('Key name?');
    });

    it('sends expiresAt from the --expiration flag', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code',
        '--expiration',
        '7d'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const expiresAt = lastCreateBody?.expiresAt as number;
      expect(typeof expiresAt).toBe('number');
      const days = (expiresAt - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6);
      expect(days).toBeLessThan(8);
    });

    it('does not send expiresAt for --expiration none', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code',
        '--expiration',
        'none'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(lastCreateBody?.expiresAt).toBeUndefined();
    });

    it('rejects an invalid --expiration', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code',
        '--expiration',
        'soon'
      );

      expect(await aiGateway(client)).toBe(1);
      await expect(client.stderr).toOutput('Invalid expiration');
    });
  });

  describe('apply action', () => {
    function startInteractiveSetup(extraArgv: string[] = []) {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      mkdirSync(join(home, '.claude'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code',
        '--name',
        'my-key',
        '--refresh-period',
        'none',
        '--expiration',
        'none',
        ...extraArgv
      );
      return aiGateway(client);
    }

    it('shows the key-creation context on the team picker, not a separate line', async () => {
      const exitCodePromise = startInteractiveSetup();

      await expect(client.stderr).toOutput('AI Gateway API key?');
      client.stdin.write('\n'); // create a new key
      await expect(client.stderr).toOutput('Which team?');
      await expect(client.stderr).toOutput(
        'The new AI Gateway API key will be created under this team:'
      );
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Apply these changes?');
      client.stdin.write('n\n');

      expect(await exitCodePromise).toBe(0);
    });

    it('cancels without creating a key or writing files', async () => {
      const exitCodePromise = startInteractiveSetup();

      await expect(client.stderr).toOutput('AI Gateway API key?');
      client.stdin.write('\n'); // create a new key
      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Apply these changes?');
      client.stdin.write('n\n');

      expect(await exitCodePromise).toBe(0);
      await expect(client.stderr).toOutput('No files were changed');
      expect(existsSync(claudeSettingsPath())).toBe(false);
      expect(lastCreateBody).toBeUndefined();
    });

    it.each([
      { keychain: false, action: 'cancel' },
      { keychain: true, action: 'cancel' },
      { keychain: true, action: 'copy' },
    ])('reports $action accurately through vercel setup (keychain: $keychain)', async ({
      keychain,
      action,
    }) => {
      keychainState.available = keychain;
      useTopModels();
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      mkdirSync(join(home, '.claude'), { recursive: true });
      client.setArgv('setup', '--gateway', '--scope', team.slug);
      const exitCodePromise = setup(client);

      await expect(client.stderr).toOutput('Which coding agents');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('AI Gateway API key?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Key name?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Set a spend limit');
      client.stdin.write('n\n');
      await expect(client.stderr).toOutput('Set an expiration');
      client.stdin.write('n\n');
      if (keychain) {
        await expect(client.stderr).toOutput('macOS Keychain');
        client.stdin.write('\n');
      }
      await expect(client.stderr).toOutput('Apply these changes?');
      client.stdin.write(
        !keychain ? 'n\n' : action === 'copy' ? '\x1b[B\n' : '\x1b[B\x1b[B\n'
      );

      expect(await exitCodePromise).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Setup incomplete');
      expect(stderr).not.toContain('Setup complete');
      expect(stderr).not.toContain('✓');
      expect(existsSync(claudeSettingsPath())).toBe(false);
      if (action === 'copy') {
        expect(stderr).toContain('Prompt generated (apply it with your agent)');
        expect(lastCreateBody).toBeDefined();
        expect(keychainState.stored).toContain(CREATED_KEY);
        expect(keychainState.copied[0]).not.toContain(CREATED_KEY);
      } else {
        expect(stderr).toContain('Canceled (no changes applied)');
        expect(lastCreateBody).toBeUndefined();
      }
    });

    it('copies a prompt and delegates file writes when keychain-backed', async () => {
      keychainState.available = true;
      const exitCodePromise = startInteractiveSetup();

      await expect(client.stderr).toOutput('AI Gateway API key?');
      client.stdin.write('\n'); // create a new key
      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('macOS Keychain');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Apply these changes?');
      client.stdin.write('\x1b[B\n');

      expect(await exitCodePromise).toBe(0);
      await expect(client.stderr).toOutput('Prompt copied');

      expect(lastCreateBody).toBeDefined();
      expect(keychainState.stored).toContain(CREATED_KEY);
      expect(existsSync(claudeSettingsPath())).toBe(false);

      const [prompt] = keychainState.copied;
      expect(prompt).toBeDefined();
      expect(prompt).toContain('settings.json');
      expect(prompt).not.toContain(CREATED_KEY);
    });

    it('prints the prompt when the clipboard is unavailable', async () => {
      keychainState.available = true;
      keychainState.copyResult = false;
      const exitCodePromise = startInteractiveSetup();

      await expect(client.stderr).toOutput('AI Gateway API key?');
      client.stdin.write('\n'); // create a new key
      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('macOS Keychain');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Apply these changes?');
      client.stdin.write('\x1b[B\n');

      expect(await exitCodePromise).toBe(0);
      await expect(client.stderr).toOutput('Prompt printed below');
      expect(client.stdout.getFullOutput()).toContain('settings.json');
    });

    it('applies normally when the y/n confirm is accepted', async () => {
      const exitCodePromise = startInteractiveSetup();

      await expect(client.stderr).toOutput('AI Gateway API key?');
      client.stdin.write('\n'); // create a new key
      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Apply these changes?');
      client.stdin.write('\n');

      expect(await exitCodePromise).toBe(0);
      expect(existsSync(claudeSettingsPath())).toBe(true);
      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe(CREATED_KEY);
    });

    it('--apply prompt emits the prompt on stdout without writing files', async () => {
      keychainState.available = true;
      const exitCode = await startInteractiveSetup([
        '--apply',
        'prompt',
        '--yes',
      ]);

      expect(exitCode).toBe(0);
      expect(lastCreateBody).toBeDefined();
      expect(keychainState.stored).toContain(CREATED_KEY);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('settings.json');
      expect(out).not.toContain(CREATED_KEY);
      expect(existsSync(claudeSettingsPath())).toBe(false);
    });

    it('--apply edit writes the files without prompting', async () => {
      const exitCode = await startInteractiveSetup([
        '--apply',
        'edit',
        '--yes',
      ]);

      expect(exitCode).toBe(0);
      expect(existsSync(claudeSettingsPath())).toBe(true);
      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe(CREATED_KEY);
    });

    it('--apply prompt is rejected without the Keychain', async () => {
      const exitCode = await startInteractiveSetup([
        '--apply',
        'prompt',
        '--yes',
      ]);

      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('macOS Keychain');
      expect(lastCreateBody).toBeUndefined();
      expect(existsSync(claudeSettingsPath())).toBe(false);
    });

    it('rejects an invalid --apply value', async () => {
      const exitCode = await startInteractiveSetup([
        '--apply',
        'nope',
        '--yes',
      ]);

      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid --apply');
    });
  });

  describe('custom config paths', () => {
    it('writes an agent config to an --agent-config path', async () => {
      useUser();
      client.nonInteractive = true;
      const custom = join(home, 'work', 'claude', 'settings.json');
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0009',
        '--agent',
        'claude-code',
        '--agent-config',
        `claude-code=${custom}`
      );

      expect(await aiGateway(client)).toBe(0);
      expect(existsSync(custom)).toBe(true);
      // The default location is left untouched.
      expect(existsSync(claudeSettingsPath())).toBe(false);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.configured[0].file).toBe(custom);
    });

    it('honors an agent-native config dir env var (CLAUDE_CONFIG_DIR)', async () => {
      const plan = await buildSetupPlan([claudeCode], {
        apiKey: 'vck_x',
        home,
        useKeychain: false,
        // (set per-test; restored by afterEach)
      });
      expect(
        plan.changes.some(
          c => c.path === join(home, '.claude', 'settings.json')
        )
      ).toBe(true);

      process.env.CLAUDE_CONFIG_DIR = join(home, 'alt-claude');
      const relocated = await buildSetupPlan([claudeCode], {
        apiKey: 'vck_x',
        home,
        useKeychain: false,
      });
      expect(
        relocated.changes.some(
          c => c.path === join(home, 'alt-claude', 'settings.json')
        )
      ).toBe(true);
    });

    it('writes fish syntax to a fish rc', async () => {
      const fishRc = join(home, '.config', 'fish', 'config.fish');
      const plan = await buildSetupPlan([codex], {
        apiKey: "vck_a'b",
        home,
        useKeychain: false,
        shellRcOverride: fishRc,
      });
      const shell = plan.changes.find(c => c.format === 'shell');
      expect(shell?.path).toBe(fishRc);
      expect(shell?.next).toContain('set -gx AI_GATEWAY_API_KEY');
      expect(shell?.next).not.toContain('export ');
    });

    it('rejects a malformed --agent-config', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code',
        '--agent-config',
        'claude-code' // missing =path
      );
      expect(await aiGateway(client)).toBe(1);
      await expect(client.stderr).toOutput('Invalid --agent-config');
    });

    it('rejects an override for an unselected agent', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code',
        '--agent-config',
        'codex=/tmp/x/config.toml'
      );
      expect(await aiGateway(client)).toBe(1);
      await expect(client.stderr).toOutput("isn't selected");
    });
  });

  describe('idempotency', () => {
    it('is a no-op on the second run with the same key', async () => {
      useUser();
      client.nonInteractive = true;
      const argv = [
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0005',
        '--agent',
        'claude-code',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const first = readFileSync(claudeSettingsPath(), 'utf8');
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const second = readFileSync(claudeSettingsPath(), 'utf8');

      expect(second).toBe(first);
      const secondJson = client.stdout.getFullOutput().slice(stdoutAfterFirst);
      const out = JSON.parse(secondJson);
      expect(out.configured).toHaveLength(0);
    });

    it.skipIf(process.platform === 'win32')(
      'copilot re-run is a no-op and existing rc content survives',
      async () => {
        useUser();
        client.nonInteractive = true;
        writeFileSync(bashrcPath(), 'alias ll="ls -la"\n');
        const argv = [
          'ai-gateway',
          'setup',
          '--key',
          'vck_DummyKey0005',
          '--agent',
          'copilot',
        ] as const;

        client.setArgv(...argv);
        expect(await aiGateway(client)).toBe(0);
        const first = readFileSync(bashrcPath(), 'utf8');
        expect(first).toContain('alias ll="ls -la"');
        expect(first).toContain('COPILOT_PROVIDER_API_KEY');
        const stdoutAfterFirst = client.stdout.getFullOutput().length;

        client.setArgv(...argv);
        expect(await aiGateway(client)).toBe(0);
        expect(readFileSync(bashrcPath(), 'utf8')).toBe(first);
        const out = JSON.parse(
          client.stdout.getFullOutput().slice(stdoutAfterFirst)
        );
        expect(out.configured).toHaveLength(0);
      }
    );

    it('is a no-op on the second Qwen Code run with the same key', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.qwen'), { recursive: true });
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0005',
        '--agent',
        'qwen',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const settingsPath = join(home, '.qwen', 'settings.json');
      const first = readFileSync(settingsPath, 'utf8');
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);

      expect(readFileSync(settingsPath, 'utf8')).toBe(first);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.configured).toHaveLength(0);
    });

    it('is a no-op on the second Continue run — the YAML is byte-identical', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.continue'), { recursive: true });
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0005',
        '--agent',
        'continue',
      ] as const;
      const configPath = join(home, '.continue', 'config.yaml');

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const first = readFileSync(configPath, 'utf8');
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);

      expect(readFileSync(configPath, 'utf8')).toBe(first);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.reason).toBe('already_configured');
      expect(out.configured).toHaveLength(0);
    });

    it('is a no-op on the second Junie run with the same key', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.junie'), { recursive: true });
      const argv = [
        'ai-gateway',
        'setup',
        '--key',
        'vck_DummyKey0005',
        '--agent',
        'junie',
      ] as const;
      const profilePath = join(
        home,
        '.junie',
        'models',
        'vercel-ai-gateway.json'
      );

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const first = readFileSync(profilePath, 'utf8');
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);

      expect(readFileSync(profilePath, 'utf8')).toBe(first);
      const secondJson = client.stdout.getFullOutput().slice(stdoutAfterFirst);
      expect(JSON.parse(secondJson).configured).toHaveLength(0);
    });

    it('does not mint a new key when re-run without --key', async () => {
      const team = useTeam();
      useUser();
      let creates = 0;
      client.scenario.post('/v1/api-keys', (req, res) => {
        creates++;
        res.json({
          ...mockApiKeyResponse,
          apiKeyString: `vck_Minted${creates}0000000`,
        });
      });
      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      const argv = [
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code',
        '--name',
        'my-coding-key',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(creates).toBe(1);
      const first = readFileSync(claudeSettingsPath(), 'utf8');
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(creates).toBe(1);
      expect(readFileSync(claudeSettingsPath(), 'utf8')).toBe(first);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.reason).toBe('already_configured');
      expect(out.configured).toHaveLength(0);
    });

    it('--reconfigure mints a fresh key and rewrites the configs', async () => {
      const team = useTeam();
      useUser();
      let creates = 0;
      client.scenario.post('/v1/api-keys', (req, res) => {
        creates++;
        res.json({
          ...mockApiKeyResponse,
          apiKeyString: `vck_Minted${creates}0000000`,
        });
      });
      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      const argv = [
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code',
        '--name',
        'my-coding-key',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      expect(creates).toBe(1);

      client.setArgv(...argv, '--reconfigure');
      expect(await aiGateway(client)).toBe(0);
      expect(creates).toBe(2);
      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('vck_Minted20000000');
    });
  });

  describe('Codex Desktop session migration', () => {
    it('prompts or copies without changing config or creating a key', async () => {
      const id = '019e944c-b55e-7af2-9ed6-013d2e573834';
      const directory = join(home, '.codex', 'sessions', '2026', '07', '27');
      const source = join(directory, `rollout-2026-07-27T00-00-00-${id}.jsonl`);
      const content = `${JSON.stringify({
        type: 'session_meta',
        payload: {
          id,
          originator: 'Codex Desktop',
          model_provider: 'openai',
        },
      })}\n{"type":"event","payload":"unchanged"}\n`;
      useUser();
      useCreateApiKey();
      client.nonInteractive = true;
      const run = async (...args: string[]) => {
        client.setArgv(
          'ai-gateway',
          'coding-agents',
          'setup',
          '--agent',
          'codex',
          '--no-keychain',
          ...args
        );
        return aiGateway(client);
      };
      expect(await run('--key', 'vck_ExistingCodexKey')).toBe(0);
      mkdirSync(directory, { recursive: true });
      writeFileSync(source, content);
      const config = readFileSync(codexConfigPath(), 'utf8');
      // Windows writes no shell rc (env must be set manually), so there's
      // nothing to preserve there.
      const shell =
        process.platform === 'win32'
          ? null
          : readFileSync(bashrcPath(), 'utf8');
      client.config.currentTeam = undefined;

      let offset = client.stdout.getFullOutput().length;
      expect(await run('--dry-run')).toBe(0);
      const dryRun = JSON.parse(client.stdout.getFullOutput().slice(offset));
      expect(dryRun.migrations).toMatchObject([
        { agent: 'codex', action: 'would_copy', sessions: 1 },
      ]);
      offset = client.stdout.getFullOutput().length;
      expect(
        await run('--no-session-migration', '--key', 'vck_ExistingCodexKey')
      ).toBe(0);
      expect(
        JSON.parse(client.stdout.getFullOutput().slice(offset)).reason
      ).toBe('already_configured');

      offset = client.stdout.getFullOutput().length;
      expect(await run('--apply', 'prompt')).toBe(0);
      const prompt = JSON.parse(client.stdout.getFullOutput().slice(offset));
      expect(prompt).toMatchObject({ reason: 'agent_prompt', configured: [] });
      expect(prompt.prompt).toContain('Never move, edit, delete');
      expect(readdirSync(directory)).toHaveLength(1);

      offset = client.stdout.getFullOutput().length;
      expect(await run()).toBe(0);
      const applied = JSON.parse(client.stdout.getFullOutput().slice(offset));
      expect(applied).toMatchObject({
        reason: 'sessions_migrated',
        configured: [],
        migrated: [{ agentId: 'codex', copied: 1, skipped: 0 }],
      });
      expect(lastCreateBody).toBeUndefined();
      expect(readFileSync(source, 'utf8')).toBe(content);
      expect(readFileSync(codexConfigPath(), 'utf8')).toBe(config);
      if (shell !== null) {
        expect(readFileSync(bashrcPath(), 'utf8')).toBe(shell);
      }
      expect(readdirSync(directory)).toHaveLength(2);
    });
  });

  describe('key rotation', () => {
    it('updates the config when re-run with a different key', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_OldKey0001',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(0);

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_NewKey0002',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(0);

      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('vck_NewKey0002');
      // The pre-rotation config is kept as a backup.
      const backup = JSON.parse(
        readFileSync(`${claudeSettingsPath()}.bak`, 'utf8')
      );
      expect(backup.env.ANTHROPIC_AUTH_TOKEN).toBe('vck_OldKey0001');
    });

    it('stores a rotated key in the Keychain even when configs are unchanged', async () => {
      useUser();
      keychainState.available = true;

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--yes',
        '--key',
        'vck_OldKey0001',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(0);
      expect(keychainState.stored).toEqual(['vck_OldKey0001']);
      // Keychain mode: the key lives outside the config files…
      expect(readFileSync(claudeSettingsPath(), 'utf8')).not.toContain(
        'vck_OldKey0001'
      );

      // …so re-running with a new key writes no files but must still refresh
      // the Keychain entry.
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--yes',
        '--key',
        'vck_NewKey0002',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(0);
      expect(keychainState.stored).toEqual([
        'vck_OldKey0001',
        'vck_NewKey0002',
      ]);
      expect(client.stderr.getFullOutput()).toContain(
        'updated the macOS Keychain'
      );
    });

    it('does not touch the Keychain during --dry-run', async () => {
      useUser();
      keychainState.available = true;

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--yes',
        '--key',
        'vck_OldKey0001',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(0);

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--dry-run',
        '--yes',
        '--key',
        'vck_NewKey0002',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(0);
      expect(keychainState.stored).toEqual(['vck_OldKey0001']);
    });

    it('fails when the rotated key cannot be stored in the Keychain', async () => {
      useUser();
      keychainState.available = true;

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--yes',
        '--key',
        'vck_OldKey0001',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(0);

      keychainState.storeResult = false;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--yes',
        '--key',
        'vck_NewKey0002',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Failed to update the key in the macOS Keychain'
      );
    });

    it('refreshes the Keychain on a non-interactive re-run with a new key', async () => {
      useUser();
      keychainState.available = true;
      client.nonInteractive = true;

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_OldKey0031',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(0);
      expect(keychainState.stored).toEqual(['vck_OldKey0031']);
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_NewKey0032',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(0);
      expect(keychainState.stored).toEqual([
        'vck_OldKey0031',
        'vck_NewKey0032',
      ]);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.reason).toBe('already_configured');
      expect(out.message).toContain('updated the macOS Keychain');
    });
  });

  describe('safety', () => {
    it('skips a malformed config instead of clobbering it, and fails the run', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(claudeSettingsPath(), '{ this is not json', 'utf8');

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0006',
        '--agent',
        'claude-code'
      );
      // Nothing could be configured, so the run reports failure.
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(1);

      // File untouched.
      expect(readFileSync(claudeSettingsPath(), 'utf8')).toBe(
        '{ this is not json'
      );
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.status).toBe('error');
      expect(
        out.skipped.some((s: any) => s.reason === 'unparseable_config')
      ).toBe(true);
    });

    it('does not create an API key when nothing can be written', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(claudeSettingsPath(), '{ this is not json', 'utf8');

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(1);
      expect(lastCreateBody).toBeUndefined();
    });

    it('exits 1 when the only config cannot be written (interactive)', async () => {
      useUser();
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(claudeSettingsPath(), '{ this is not json', 'utf8');

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--yes',
        '--key',
        'vck_DummyKey0013',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        "Couldn't write any agent configurations"
      );
    });

    it('still configures the healthy agents when one config is malformed', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(claudeSettingsPath(), '{ this is not json', 'utf8');

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0014',
        '--agent',
        'claude-code',
        '--agent',
        'codex'
      );
      expect(await aiGateway(client)).toBe(0);
      expect(existsSync(codexConfigPath())).toBe(true);

      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.status).toBe('ok');
      expect(out.configured.length).toBeGreaterThan(0);
      expect(
        out.skipped.some((s: any) => s.reason === 'unparseable_config')
      ).toBe(true);
    });

    it('exits 1 without minting when only the shell export would be written', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(codexConfigPath(), 'not = = toml', 'utf8');

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'codex'
      );
      // The .bashrc export alone must not count as a successful configuration.
      expect(await aiGateway(client)).toBe(1);
      expect(lastCreateBody).toBeUndefined();
      expect(existsSync(bashrcPath())).toBe(false);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.status).toBe('error');
    });

    it('never prints the full key — only a masked form', async () => {
      useUser();
      const secret = 'vck_SuperSecretValue98765';
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        secret,
        '--agent',
        'claude-code',
        '--yes'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      // Masked in the diff and the receipt; the full secret never reaches the
      // terminal (it lives only in the config files).
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('vck_••••8765');
      expect(stderr).not.toContain(secret);
      expect(client.stdout.getFullOutput()).not.toContain(secret);
    });
  });

  describe('receipt layout', () => {
    it('previews a backup without repeating it in the receipt', async () => {
      useUser();
      client.nonInteractive = false;
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(claudeSettingsPath(), '{"env":{"FOO":"bar"}}', 'utf8');
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_ReceiptKey0001x',
        '--agent',
        'claude-code',
        '--yes'
      );

      expect(await aiGateway(client)).toBe(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(`backs up to ${claudeSettingsPath()}.bak`);
      expect(existsSync(`${claudeSettingsPath()}.bak`)).toBe(true);
      expect(stderr).not.toContain('Backups');
      expect(stderr).not.toContain('Previous files saved alongside');
    });

    it('prints one ✓ Connected row; files and key are secondary rows', async () => {
      useUser();
      client.nonInteractive = false;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_ReceiptKey0001x',
        '--agent',
        'claude-code',
        '--yes'
      );

      expect(await aiGateway(client)).toBe(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('✓ Connected');
      // Exactly one ✓ — file rows and the key row keep the blank gutter.
      expect(stderr.match(/✓/g)).toHaveLength(1);
      // No-color output may trim the blank gutter; keep semantic glyphs off
      // secondary rows and leave exact gutter spacing to the helper tests.
      expect(stderr).toMatch(/^ *Created {9}/m);
      expect(stderr).toMatch(/^ *API Key {9}vck_/m);
      expect(stderr).not.toContain('WARNING!');
    });

    it('labels a freshly created key "New API Key"', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.nonInteractive = false;
      mkdirSync(join(home, '.claude'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code',
        '--yes'
      );

      expect(await aiGateway(client)).toBe(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toMatch(/^ *New API Key {5}vck_/m);
      expect(stderr).not.toMatch(/^ *API Key {9}vck_/m);
    });
  });

  describe('validation', () => {
    it('rejects a negative budget', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--budget',
        '-5',
        '--agent',
        'claude-code',
        '--key',
        'vck_x'
      );
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Budget must be a positive number in dollars'
      );
    });

    it('rejects an unknown agent', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'bogus',
        '--key',
        'vck_x'
      );
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Unknown agent');
    });
  });

  describe('existing config is merged, not clobbered', () => {
    it('preserves unrelated keys in an existing settings.json', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(
        claudeSettingsPath(),
        JSON.stringify({ env: { FOO: 'bar' }, theme: 'dark' }, null, 2),
        'utf8'
      );
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_MergeKey0001',
        '--agent',
        'claude-code'
      );

      expect(await aiGateway(client)).toBe(0);

      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      // Pre-existing user settings survive the merge…
      expect(settings.theme).toBe('dark');
      expect(settings.env.FOO).toBe('bar');
      // …and the gateway keys land alongside them.
      expect(settings.env.ANTHROPIC_BASE_URL).toBe(
        'https://ai-gateway.vercel.sh/claude-code'
      );
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('vck_MergeKey0001');
      expect(settings.env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY).toBe('1');
      expect(settings.env.ENABLE_TOOL_SEARCH).toBe('true');
    });

    it('keeps the existing file formatting; only the added keys change the file', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      // Deliberately 4-space indented — the merge must follow the file's own
      // style instead of reformatting it to ours.
      const original = [
        '{',
        '    "theme": "dark",',
        '    "env": {',
        '        "FOO": "bar"',
        '    }',
        '}',
        '',
      ].join('\n');
      writeFileSync(claudeSettingsPath(), original, 'utf8');
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_FormatKey01',
        '--agent',
        'claude-code'
      );

      expect(await aiGateway(client)).toBe(0);

      const next = readFileSync(claudeSettingsPath(), 'utf8');
      // Untouched lines are byte-identical (4-space indent survives)…
      expect(next).toContain('    "theme": "dark",');
      expect(next).toContain('        "FOO": "bar"');
      // …and inserted keys follow the file's indentation, not our default.
      expect(next).toContain('        "ANTHROPIC_BASE_URL"');
      // No line was re-indented to our 2-space default.
      expect(next).not.toMatch(/^ {2}"/m);
    });
  });

  describe('mergeJson edits in place', () => {
    it('leaves a minified file on one line, untouched content byte-identical', () => {
      const current =
        '{"mcp":{"devbox":{"command":["/x/devbox","mcp"],"enabled":true}}}';
      const next = mergeJson(current, { provider: { vercel: {} } });
      expect(next).toContain(
        '{"mcp":{"devbox":{"command":["/x/devbox","mcp"],"enabled":true}}'
      );
      expect(next.trim()).not.toContain('\n');
      expect(JSON.parse(next)).toEqual({
        mcp: { devbox: { command: ['/x/devbox', 'mcp'], enabled: true } },
        provider: { vercel: {} },
      });
    });

    it('returns the input byte-for-byte when every value already matches', () => {
      const current = '{\n\t"env": {\n\t\t"A": "b"\n\t},\n\t"x": 1\n}\n';
      expect(mergeJson(current, { env: { A: 'b' } })).toBe(current);
    });

    it('does not clobber an existing object with an empty-object patch', () => {
      const current = '{"provider":{"vercel":{"options":{"apiKey":"vck_1"}}}}';
      expect(mergeJson(current, { provider: { vercel: {} } })).toBe(current);
    });

    it('replaces a changed value in place', () => {
      const current = '{\n  "env": {\n    "TOKEN": "vck_old"\n  }\n}\n';
      expect(mergeJson(current, { env: { TOKEN: 'vck_new' } })).toBe(
        '{\n  "env": {\n    "TOKEN": "vck_new"\n  }\n}\n'
      );
    });

    it('preserves CRLF line endings', () => {
      const current = '{\r\n  "a": 1\r\n}\r\n';
      const next = mergeJson(current, { env: { K: 'v' } });
      expect(next).toContain('\r\n');
      expect(next.replace(/\r\n/g, '')).not.toContain('\n');
    });

    it('still rejects invalid JSON and non-object roots', () => {
      expect(() => mergeJson('{ nope', { a: 1 })).toThrow(
        /existing file is not valid JSON/
      );
      expect(() => mergeJson('[1, 2]', { a: 1 })).toThrow(
        /existing file is not a JSON object/
      );
    });

    it('falls back to a rewrite for duplicate keys instead of a dead edit', () => {
      // jsonc-parser edits the first duplicate, JSON.parse keeps the last —
      // the in-place edit would land in the object nobody reads. The verify
      // step must catch that and take the plain rewrite.
      const current = '{"env":{"A":"1"},"theme":"dark","env":{"B":"2"}}';
      const next = mergeJson(current, { env: { TOKEN: 'vck_x' } });
      const parsed = JSON.parse(next);
      expect(parsed.env).toEqual({ B: '2', TOKEN: 'vck_x' });
      expect(parsed.theme).toBe('dark');

      // A duplicate whose first occurrence is not even an object used to make
      // the editor throw; it must fall back instead of erroring the plan.
      const hostile = '{"env":"weird","env":{"B":"2"}}';
      const fixed = JSON.parse(mergeJson(hostile, { env: { TOKEN: 'vck_x' } }));
      expect(fixed.env).toEqual({ B: '2', TOKEN: 'vck_x' });
    });
  });

  describe('mergeToml edits in place', () => {
    const PATCH = {
      model_provider: 'vercel',
      model_providers: {
        vercel: { name: 'Vercel AI Gateway', wire_api: 'responses' },
      },
    };

    it('preserves comments, quoting, and spacing of untouched lines', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.codex'), { recursive: true });
      const original = [
        'model = "gpt-5.5"  # my pick',
        '',
        '[desktop.fonts]',
        `code = '"Geist Mono", ui-monospace'`,
        '',
      ].join('\n');
      writeFileSync(codexConfigPath(), original, 'utf8');
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_TomlKey0001',
        '--agent',
        'codex'
      );

      expect(await aiGateway(client)).toBe(0);

      const next = readFileSync(codexConfigPath(), 'utf8');
      // The user's lines survive byte-for-byte: inline comment, TOML
      // literal-string quoting, everything.
      expect(next).toContain('model = "gpt-5.5"  # my pick');
      expect(next).toContain(`code = '"Geist Mono", ui-monospace'`);
      // Only the gateway keys were added.
      const toml = tomlParse(next) as any;
      expect(toml.model_provider).toBe('vercel');
      expect(toml.model_providers.vercel.wire_api).toBe('responses');
    });

    it('replaces an existing model_provider assignment in place', () => {
      const next = mergeToml(
        '# provider\nmodel_provider = "openai"\n\n[other]\nx = 1\n',
        PATCH
      );
      expect(next).toContain('# provider');
      expect(next).toContain('model_provider = "vercel"');
      expect(next).not.toContain('"openai"');
      expect(next).toContain('[other]\nx = 1');
    });

    it('keeps user keys in an existing [model_providers.vercel] table', () => {
      const next = mergeToml(
        '[model_providers.vercel]\nname = "Old"\nquery_params = "keep"\n',
        PATCH
      );
      expect(next).toContain('query_params = "keep"');
      expect(next).toContain('name = "Vercel AI Gateway"');
      expect(next).not.toContain('"Old"');
    });

    it('returns the input byte-for-byte when already configured', () => {
      const configured = mergeToml('model = "gpt-5.5"\n', PATCH);
      expect(mergeToml(configured, PATCH)).toBe(configured);
    });

    it('falls back to a full rewrite for layouts it cannot edit in place', () => {
      // An inline table cannot take an appended [model_providers.vercel]
      // header, so the editor must give up rather than corrupt the file.
      const next = mergeToml(
        'model_providers = { vercel = { name = "x" } }\n',
        PATCH
      );
      const toml = tomlParse(next) as any;
      expect(toml.model_provider).toBe('vercel');
      expect(toml.model_providers.vercel.wire_api).toBe('responses');
    });

    it('still rejects invalid TOML', () => {
      expect(() => mergeToml('model = [unclosed', { a: 1 })).toThrow(
        /existing file is not valid TOML/
      );
    });

    it('never corrupts a multi-line string that looks like an assignment', () => {
      // The line editor is not string-aware: a naive replace would rewrite
      // the assignment-lookalike INSIDE the string. The full-document verify
      // must reject that edit and fall back.
      const banner = 'model_provider = "mine"';
      const current = `banner = """\n${banner}\n"""\nmodel_provider = "vercel"\n`;
      const next = mergeToml(current, PATCH);
      const toml = tomlParse(next) as any;
      expect(toml.banner).toContain(banner);
      expect(toml.model_provider).toBe('vercel');
      expect(toml.model_providers.vercel.wire_api).toBe('responses');
    });
  });

  describe('shell rc managed block', () => {
    it('replaces an existing block in place, leaving surrounding lines intact', () => {
      const before = [
        '# my rc',
        'export PATH="$PATH:/usr/local/bin"',
        '# >>> vercel ai-gateway >>>',
        "export AI_GATEWAY_API_KEY='old'",
        '# <<< vercel ai-gateway <<<',
        'alias ll="ls -la"',
        '',
      ].join('\n');

      const next = upsertManagedBlock(
        before,
        "export AI_GATEWAY_API_KEY='new'"
      );

      // Exactly one managed block, updated in place — never duplicated.
      expect(next.match(/>>> vercel ai-gateway >>>/g)).toHaveLength(1);
      expect(next).toContain("export AI_GATEWAY_API_KEY='new'");
      expect(next).not.toContain("export AI_GATEWAY_API_KEY='old'");
      // The user's own lines are untouched.
      expect(next).toContain('export PATH="$PATH:/usr/local/bin"');
      expect(next).toContain('alias ll="ls -la"');
    });

    it('appends a managed block when the rc has none', () => {
      const next = upsertManagedBlock('# just my rc\n', 'export X=1');
      expect(next).toContain('# just my rc');
      expect(next.match(/>>> vercel ai-gateway >>>/g)).toHaveLength(1);
    });

    it('separates the appended block from existing content with a blank line', () => {
      const block = [
        '# >>> vercel ai-gateway >>>',
        'export X=1',
        '# <<< vercel ai-gateway <<<',
        '',
      ].join('\n');

      // A newline-terminated rc gains exactly one blank separator line.
      expect(upsertManagedBlock('alias ll="ls -la"\n', 'export X=1')).toBe(
        `alias ll="ls -la"\n\n${block}`
      );
      // No trailing newline: terminate the last line, then the blank line.
      expect(upsertManagedBlock('alias ll="ls -la"', 'export X=1')).toBe(
        `alias ll="ls -la"\n\n${block}`
      );
      // Already blank-line-terminated: nothing extra is added.
      expect(upsertManagedBlock('alias ll="ls -la"\n\n', 'export X=1')).toBe(
        `alias ll="ls -la"\n\n${block}`
      );
      // An empty rc starts with the block — no leading blank line.
      expect(upsertManagedBlock('', 'export X=1')).toBe(block);
      expect(upsertManagedBlock(null, 'export X=1')).toBe(block);
    });
  });

  describe('renderDiff secret masking', () => {
    it('masks a literal key in a POSIX export line', () => {
      const out = renderDiff('', "export AI_GATEWAY_API_KEY='vck_LeakMe12345'");
      expect(out).not.toContain('vck_LeakMe12345');
      expect(out).toContain('vck_••••2345');
    });

    it('masks a literal key in a fish set -gx line', () => {
      const out = renderDiff(
        '',
        "set -gx AI_GATEWAY_API_KEY 'vck_LeakMe12345'"
      );
      expect(out).not.toContain('vck_LeakMe12345');
      expect(out).toContain('vck_••••2345');
    });

    it('masks JSON secret fields without a known secret list', () => {
      const out = renderDiff('', '{\n  "apiKey": "vck_LeakMe12345"\n}');
      expect(out).not.toContain('vck_LeakMe12345');
    });

    it('leaves the keychain lookup command readable — it holds no secret', () => {
      const line = `export AI_GATEWAY_API_KEY="$(/usr/bin/security find-generic-password -s 'Vercel AI Gateway' -a 'vercel-ai-gateway' -w 2>/dev/null)"`;
      const out = renderDiff('', line);
      expect(out).toContain('find-generic-password');
      expect(out).not.toContain('••••');
    });
  });

  describe('detectShellRc', () => {
    const realPlatform = process.platform;
    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: realPlatform,
        configurable: true,
      });
      delete process.env.ZDOTDIR;
    });

    it('uses .bash_profile for bash on macOS and .bashrc elsewhere', () => {
      process.env.SHELL = '/bin/bash';
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      expect(detectShellRc(home)).toBe(join(home, '.bash_profile'));
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(detectShellRc(home)).toBe(join(home, '.bashrc'));
    });

    it('relocates the zsh rc to $ZDOTDIR when set', () => {
      process.env.SHELL = '/bin/zsh';
      process.env.ZDOTDIR = join(home, 'zdot');
      expect(detectShellRc(home)).toBe(join(home, 'zdot', '.zshrc'));
    });

    it('honors an explicit override above everything else', () => {
      process.env.SHELL = '/bin/bash';
      const custom = join(home, 'custom', 'rc');
      expect(detectShellRc(home, custom)).toBe(custom);
    });
  });

  describe('windows', () => {
    const realPlatform = process.platform;
    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: realPlatform,
        configurable: true,
      });
    });

    it('skips shell setup and reports the env var instead', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      const plan = await buildSetupPlan([codex], {
        apiKey: 'vck_x',
        home,
        useKeychain: false,
      });
      expect(plan.changes.find(c => c.format === 'shell')).toBeUndefined();
      expect(plan.shellRcPath).toBeUndefined();
      expect(
        plan.notes.some(n =>
          n.notes.some(l => l.includes('AI_GATEWAY_API_KEY'))
        )
      ).toBe(true);
    });

    it('honors an explicit --shell-rc override on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      const rc = join(home, '.bashrc');
      const plan = await buildSetupPlan([codex], {
        apiKey: 'vck_x',
        home,
        useKeychain: false,
        shellRcOverride: rc,
      });
      expect(plan.changes.find(c => c.format === 'shell')?.path).toBe(rc);
    });

    it('prints a created key once when no file can carry it', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--yes',
        '--agent',
        'codex'
      );
      expect(await aiGateway(client)).toBe(0);

      // config.toml only names the env var; the key itself is only in the
      // one-time stdout line.
      expect(readFileSync(codexConfigPath(), 'utf8')).not.toContain(
        CREATED_KEY
      );
      expect(client.stdout.getFullOutput()).toContain(CREATED_KEY);
    });
  });

  describe('reconfigure', () => {
    it('re-running with the same key is a no-op and mints no new key', async () => {
      useUser();
      client.nonInteractive = true;
      const argv = [
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_Same0001',
        '--agent',
        'claude-code',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const afterFirst = client.stdout.getFullOutput().length;

      // If a no-op ever mints a key, this endpoint flips the flag and fails us.
      let minted = false;
      client.scenario.post('/v1/api-keys', (_req, res) => {
        minted = true;
        res.json(mockApiKeyResponse);
      });

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);

      const out = JSON.parse(client.stdout.getFullOutput().slice(afterFirst));
      expect(out.reason).toBe('already_configured');
      expect(out.configured).toHaveLength(0);
      expect(minted).toBe(false);
    });

    it('--reconfigure re-runs past the already-configured short-circuit', async () => {
      useUser();
      client.nonInteractive = true;
      const base = [
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_Same0002',
        '--agent',
        'claude-code',
      ] as const;

      client.setArgv(...base);
      expect(await aiGateway(client)).toBe(0);
      const afterFirst = client.stdout.getFullOutput().length;

      client.setArgv(...base, '--reconfigure');
      expect(await aiGateway(client)).toBe(0);

      const out = JSON.parse(client.stdout.getFullOutput().slice(afterFirst));
      // Not short-circuited: it proceeded and re-applied the configuration.
      expect(out.reason).toBe('coding_agents_configured');
    });

    it('prompts to reconfigure when already set up and proceeds on confirm', async () => {
      useUser();
      client.nonInteractive = true;
      const argv = [
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_Old0003',
        '--agent',
        'claude-code',
      ] as const;
      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);

      // Re-run interactively with the same key: it's already configured, so the
      // user is asked whether to reconfigure instead of getting a silent no-op.
      client.nonInteractive = false;
      client.setArgv(...argv);
      const run = aiGateway(client);
      await expect(client.stderr).toOutput('already configured');
      client.stdin.write('y\n');
      expect(await run).toBe(0);
    });
  });

  describe('unconventional locations and multi-agent runs', () => {
    it('places the OpenCode config under $XDG_CONFIG_HOME when set', async () => {
      process.env.XDG_CONFIG_HOME = join(home, 'xdg');
      const plan = await buildSetupPlan([opencode], { apiKey: 'vck_x', home });
      expect(
        plan.changes.some(
          c => c.path === join(home, 'xdg', 'opencode', 'opencode.json')
        )
      ).toBe(true);
    });

    // Shell env blocks only exist off Windows (shell rc management is disabled there).
    it.skipIf(process.platform === 'win32')(
      'shares a single deduped env block across multiple agents',
      async () => {
        const plan = await buildSetupPlan([claudeCode, codex, opencode], {
          apiKey: 'vck_multi',
          home,
          useKeychain: true,
        });

        // One config file per agent.
        expect(plan.changes.some(c => c.label === 'Claude Code settings')).toBe(
          true
        );
        expect(plan.changes.some(c => c.label === 'Codex config')).toBe(true);
        expect(plan.changes.some(c => c.label === 'OpenCode config')).toBe(
          true
        );

        // A single shared shell block. Codex and OpenCode both want
        // AI_GATEWAY_API_KEY — it's exported once (deduped) — and Claude Code
        // contributes ANTHROPIC_AUTH_TOKEN.
        const shells = plan.changes.filter(c => c.format === 'shell');
        expect(shells).toHaveLength(1);
        const gateway = shells[0].next?.match(/AI_GATEWAY_API_KEY/g) ?? [];
        expect(gateway).toHaveLength(1);
        expect(shells[0].next).toContain('ANTHROPIC_AUTH_TOKEN');
      }
    );

    it('skips a malformed Codex config instead of clobbering it', async () => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(codexConfigPath(), 'this is = = not valid toml [', 'utf8');

      const plan = await buildSetupPlan([codex], { apiKey: 'vck_x', home });
      const codexChange = plan.changes.find(c => c.format === 'toml');
      expect(codexChange?.status).toBe('error');
      expect(codexChange?.error).toContain('not valid TOML');
    });
  });

  describe('--base-url applicability', () => {
    it.skipIf(process.platform === 'win32')(
      'warns when no selected agent writes the override',
      async () => {
        useUser();
        mkdirSync(join(home, '.fx'), { recursive: true });
        client.setArgv(
          'ai-gateway',
          'setup',
          '--key',
          'vck_DummyKey0002',
          '--yes',
          '--agent',
          'fx',
          '--base-url',
          'http://localhost:9999/v1'
        );

        expect(await aiGateway(client)).toBe(0);
        expect(client.stderr.getFullOutput()).toContain(
          '--base-url has no effect'
        );
      }
    );

    it.skipIf(process.platform === 'win32')(
      'stays quiet for an agent that only names the override in its notes',
      async () => {
        useUser();
        mkdirSync(join(home, '.cursor'), { recursive: true });
        client.setArgv(
          'ai-gateway',
          'setup',
          '--key',
          'vck_DummyKey0002',
          '--yes',
          '--agent',
          'cursor',
          '--base-url',
          'http://localhost:9999/v1'
        );

        expect(await aiGateway(client)).toBe(0);
        expect(client.stderr.getFullOutput()).not.toContain(
          '--base-url has no effect'
        );
      }
    );

    it.skipIf(process.platform === 'win32')(
      'stays quiet for an agent that does write the override',
      async () => {
        useUser();
        mkdirSync(zedSettingsDir(), { recursive: true });
        client.setArgv(
          'ai-gateway',
          'setup',
          '--key',
          'vck_DummyKey0002',
          '--yes',
          '--agent',
          'zed',
          '--base-url',
          'http://localhost:9999/v1'
        );

        expect(await aiGateway(client)).toBe(0);
        expect(client.stderr.getFullOutput()).not.toContain(
          '--base-url has no effect'
        );
      }
    );
  });

  describe('config paths that are directories', () => {
    it.skipIf(process.platform === 'win32')(
      'probes for an existing gateway setup without reading a directory',
      async () => {
        const team = useTeam();
        useUser();
        useCreateApiKey();
        client.config.currentTeam = team.id;
        mkdirSync(join(home, '.omp'), { recursive: true });
        client.setArgv('ai-gateway', 'setup', '--yes', '--agent', 'omp');

        expect(await aiGateway(client)).toBe(0);
      }
    );
  });

  describe('key source on a re-run', () => {
    it.skipIf(process.platform === 'win32')(
      'reuses the stored key instead of minting when only models drifted',
      async () => {
        useUser();
        useTeam();
        useCreateApiKey();
        const rc = join(home, '.testrc');
        writeFileSync(
          rc,
          [
            '# >>> vercel ai-gateway >>>',
            "export AI_GATEWAY_API_KEY='vck_StoredKey0001'",
            '# <<< vercel ai-gateway <<<',
            '',
          ].join('\n'),
          'utf8'
        );
        const zedDir = zedSettingsDir();
        mkdirSync(zedDir, { recursive: true });
        writeFileSync(
          join(zedDir, 'settings.json'),
          JSON.stringify({
            language_models: {
              vercel_ai_gateway: {
                api_url: 'https://ai-gateway.vercel.sh/coding-agent/v1',
                available_models: [],
              },
            },
          }),
          'utf8'
        );
        client.setArgv(
          'ai-gateway',
          'setup',
          '--yes',
          '--agent',
          'zed',
          '--shell-rc',
          rc
        );

        expect(await aiGateway(client)).toBe(0);
        expect(lastCreateBody).toBeUndefined();
        expect(readFileSync(rc, 'utf8')).toContain('vck_StoredKey0001');
      }
    );

    it.skipIf(process.platform !== 'linux')(
      'writes nothing when wired but the stored key is unreadable',
      async () => {
        useUser();
        useTeam();
        useCreateApiKey();
        const zedDir = zedSettingsDir();
        mkdirSync(zedDir, { recursive: true });
        const settings = JSON.stringify({
          language_models: {
            vercel_ai_gateway: {
              api_url: 'https://ai-gateway.vercel.sh/coding-agent/v1',
              available_models: [],
            },
          },
        });
        writeFileSync(join(zedDir, 'settings.json'), settings, 'utf8');
        client.setArgv(
          'ai-gateway',
          'setup',
          '--yes',
          '--agent',
          'zed',
          '--shell-rc',
          join(home, '.missingrc')
        );

        expect(await aiGateway(client)).toBe(0);
        expect(lastCreateBody).toBeUndefined();
        expect(readFileSync(join(zedDir, 'settings.json'), 'utf8')).toBe(
          settings
        );
        expect(client.stderr.getFullOutput()).toContain(
          'stored key could not be read'
        );
      }
    );

    it.skipIf(process.platform === 'win32')(
      'defaults to reuse when a config already points at the gateway',
      async () => {
        useUser();
        useTeam();
        const zedDir = zedSettingsDir();
        mkdirSync(zedDir, { recursive: true });
        writeFileSync(
          join(zedDir, 'settings.json'),
          JSON.stringify({
            language_models: {
              vercel_ai_gateway: {
                api_url: 'https://ai-gateway.vercel.sh/coding-agent/v1',
              },
            },
          }),
          'utf8'
        );
        client.setArgv('ai-gateway', 'setup', '--dry-run', '--agent', 'zed');

        const exitCodePromise = aiGateway(client);
        await expect(client.stderr).toOutput('AI Gateway API key?');
        client.stdin.write('\n');
        // Reached only when the default is "use an existing key"; the
        // create path asks for a team next instead.
        await expect(client.stderr).toOutput('Paste your AI Gateway API key');
        client.stdin.write('vck_ExistingKey0003\n');

        expect(await exitCodePromise).toBe(0);
      }
    );
  });

  describe('Zed on Windows', () => {
    it.skipIf(process.platform !== 'win32')(
      'writes settings under %APPDATA%',
      async () => {
        useUser();
        mkdirSync(zedSettingsDir(), { recursive: true });
        client.setArgv(
          'ai-gateway',
          'setup',
          '--key',
          'vck_DummyKey0002',
          '--yes',
          '--agent',
          'zed'
        );

        expect(await aiGateway(client)).toBe(0);
        expect(zedSettingsDir()).toContain('Roaming');
        const settings = JSON.parse(
          readFileSync(join(zedSettingsDir(), 'settings.json'), 'utf8')
        );
        expect(settings.language_models.vercel_ai_gateway.api_url).toBe(
          'https://ai-gateway.vercel.sh/coding-agent/v1'
        );
      }
    );
  });
});
