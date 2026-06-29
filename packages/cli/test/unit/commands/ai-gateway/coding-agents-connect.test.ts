import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as tomlParse } from 'smol-toml';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { buildSetupPlan } from '../../../../src/util/ai-gateway/coding-agents/apply';
import { claudeCode } from '../../../../src/util/ai-gateway/coding-agents/agents/claude-code';
import { codex } from '../../../../src/util/ai-gateway/coding-agents/agents/codex';
import {
  isKeychainAvailable,
  storeKeyInKeychain,
  keychainLookup,
} from '../../../../src/util/ai-gateway/coding-agents/keychain';

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

let home: string;
let savedEnv: Record<string, string | undefined>;

function claudeSettingsPath() {
  return join(home, '.claude', 'settings.json');
}
function codexConfigPath() {
  return join(home, '.codex', 'config.toml');
}
function bashrcPath() {
  return join(home, '.bashrc');
}
function opencodeConfigPath() {
  return join(home, '.config', 'opencode', 'opencode.json');
}
function piAuthPath() {
  return join(home, '.pi', 'agent', 'auth.json');
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'vc-setup-agents-'));
  savedEnv = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    SHELL: process.env.SHELL,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    CODEX_HOME: process.env.CODEX_HOME,
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
    ZDOTDIR: process.env.ZDOTDIR,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.SHELL = '/bin/bash';
  for (const v of [
    'XDG_CONFIG_HOME',
    'CLAUDE_CONFIG_DIR',
    'CODEX_HOME',
    'PI_CODING_AGENT_DIR',
    'ZDOTDIR',
  ]) {
    delete process.env[v];
  }
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

describe('ai-gateway coding-agents connect', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'coding-agents', 'connect', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);
    });
  });

  describe('non-interactive with an existing key', () => {
    it('configures Claude Code and emits JSON with the key', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'connect',
        '--key',
        'vck_DummyKey0001',
        '--agent',
        'claude-code'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_BASE_URL).toBe(
        'https://ai-gateway.vercel.sh'
      );
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('vck_DummyKey0001');
      expect(settings.env.ANTHROPIC_API_KEY).toBe('');

      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.status).toBe('ok');
      expect(out.reason).toBe('coding_agents_configured');
      expect(out.apiKey).toBe('vck_DummyKey0001');
      expect(out.configured).toHaveLength(1);
      expect(out.configured[0].action).toBe('created');
    });

    it('configures Codex with the responses wire API and a shell export', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'connect',
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
        'https://ai-gateway.vercel.sh/v1'
      );
      expect(toml.model_providers.vercel.wire_api).toBe('responses');
      expect(toml.model_providers.vercel.env_key).toBe('AI_GATEWAY_API_KEY');

      const bashrc = readFileSync(bashrcPath(), 'utf8');
      expect(bashrc).toContain('# >>> vercel ai-gateway >>>');
      expect(bashrc).toContain("export AI_GATEWAY_API_KEY='vck_DummyKey0002'");
    });

    it('shell-escapes a key with special characters', async () => {
      useUser();
      client.nonInteractive = true;
      const trickyKey = 'vck_a$b`c\'d"e';
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'connect',
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
    });

    it('configures OpenCode with the native vercel provider', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'connect',
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

    it('configures Pi via the native vercel-ai-gateway auth entry (0600)', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'connect',
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
        'connect',
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
  });

  describe('--dry-run', () => {
    it('writes nothing and reports the planned changes', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'connect',
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

    it('prompts for name, team, quota, and expiry in order', async () => {
      useUser();
      useTeam();
      // Found at its default location, so the custom-path prompt stays quiet.
      mkdirSync(join(home, '.claude'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'connect',
        '--dry-run',
        '--agent',
        'claude-code'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('previewing changes only');
      await expect(client.stderr).toOutput('use with your coding agents');
      client.stdin.write('\n');
      // Then team.
      await expect(client.stderr).toOutput(
        'What team should the API key be under?'
      );
      client.stdin.write('\n'); // accept default scope
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
        'connect',
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

      await expect(client.stderr).toOutput(
        'What team should the API key be under?'
      );
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
        'connect',
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
        'connect',
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
      client.setArgv('ai-gateway', 'coding-agents', 'connect', '--yes');

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
      client.setArgv('ai-gateway', 'coding-agents', 'connect', '--yes');

      expect(await aiGateway(client)).toBe(1);
      await expect(client.stderr).toOutput('No coding agents detected');
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

    it('keeps the secret out of the configs and reads it from the shell', async () => {
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
      const claude = plan.changes.find(c => c.label === 'Claude Code settings');
      expect(claude?.next).toContain('ANTHROPIC_BASE_URL');
      expect(claude?.next).not.toContain('ANTHROPIC_AUTH_TOKEN');
      expect(claude?.next).not.toContain(secret);
    });

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

    it('reads the Codex env key from the Keychain instead of the config', async () => {
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
    });
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
        'connect',
        '--agent',
        'claude-code'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('use with your coding agents');
      client.stdin.write('My Coding Key\n');
      await expect(client.stderr).toOutput(
        'What team should the API key be under?'
      );
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Set a spend limit');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('Spend limit in USD');
      client.stdin.write('\n'); // accept default 100
      await expect(client.stderr).toOutput('How often should the limit reset?');
      client.stdin.write('\n'); // accept default "Never"
      await expect(client.stderr).toOutput('Set an expiration');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('Expires in');
      client.stdin.write('\n'); // accept default preset (30 days)
      // Planned changes are shown first, then the summary, then the apply prompt.
      await expect(client.stderr).toOutput('Planned changes');
      await expect(client.stderr).toOutput('Summary');
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

    it('sends expiresAt from the --expiration flag', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'connect',
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
        'connect',
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
        'connect',
        '--agent',
        'claude-code',
        '--expiration',
        'soon'
      );

      expect(await aiGateway(client)).toBe(1);
      await expect(client.stderr).toOutput('Invalid expiration');
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
        'connect',
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
        'connect',
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
        'connect',
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
        'connect',
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
  });

  describe('safety', () => {
    it('skips a malformed config instead of clobbering it', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(claudeSettingsPath(), '{ this is not json', 'utf8');

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'connect',
        '--key',
        'vck_DummyKey0006',
        '--agent',
        'claude-code'
      );
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      // File untouched.
      expect(readFileSync(claudeSettingsPath(), 'utf8')).toBe(
        '{ this is not json'
      );
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(
        out.skipped.some((s: any) => s.reason === 'unparseable_config')
      ).toBe(true);
    });

    it('never prints the full key — only a masked form', async () => {
      useUser();
      const secret = 'vck_SuperSecretValue98765';
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'connect',
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

  describe('validation', () => {
    it('rejects a negative budget', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'connect',
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
        'connect',
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
});
