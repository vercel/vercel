import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { opencode } from '../../../../src/util/ai-gateway/coding-agents/agents/opencode';
import {
  isKeychainAvailable,
  storeKeyInKeychain,
  keychainLookup,
} from '../../../../src/util/ai-gateway/coding-agents/keychain';

// A pass-through mock of the keychain module: tests that set `available` get a
// fake in-memory keychain (usable on Linux CI); everything else hits the real
// implementation.
const keychainState = vi.hoisted(() => ({
  available: undefined as boolean | undefined,
  stored: [] as string[],
  storeResult: true,
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
      isKeychainAvailable: () =>
        keychainState.available ?? actual.isKeychainAvailable(),
      storeKeyInKeychain: (key: string) => {
        if (keychainState.available === undefined) {
          return actual.storeKeyInKeychain(key);
        }
        if (keychainState.storeResult) {
          keychainState.stored.push(key);
        }
        return keychainState.storeResult;
      },
    };
  }
);

// Desktop-app detection defaults to "not installed" so a developer's real
// /Applications never leaks warnings into unrelated tests.
const desktopState = vi.hoisted(() => ({ codex: false }));

vi.mock('../../../../src/util/ai-gateway/coding-agents/desktop-apps', () => ({
  isMacAppInstalled: (bundleName: string) =>
    bundleName === 'Codex.app' ? desktopState.codex : false,
}));

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
  keychainState.available = undefined;
  keychainState.stored.length = 0;
  keychainState.storeResult = true;
  desktopState.codex = false;
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

describe('ai-gateway coding-agents setup', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'coding-agents', 'setup', '--help');
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
          'https://ai-gateway.vercel.sh/v1'
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
            '# Managed by `vercel ai-gateway coding-agents setup` — safe to remove this block.',
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

    it('prompts for team, name, quota, and expiry in order', async () => {
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
      // The owning team comes first — it decides where the key lives.
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
  });

  describe('non-interactive agent selection', () => {
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

        expect(exitSpy).toHaveBeenCalledWith(1);
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
      expect(stderr).toMatch(/^ {2}Created {9}/m);
      expect(stderr).toMatch(/^ {2}API Key {9}vck_/m);
      expect(stderr).not.toContain('WARNING!');
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
        'https://ai-gateway.vercel.sh'
      );
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('vck_MergeKey0001');
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

  describe('desktop-app consent', () => {
    it('asks before configuring Codex when its desktop app is installed', async () => {
      useUser();
      desktopState.codex = true;
      mkdirSync(join(home, '.codex'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0020',
        '--agent',
        'codex'
      );

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        'The Codex desktop app will stop working'
      );
      await expect(client.stderr).toOutput('Configure Codex anyway?');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('Apply these changes?');
      client.stdin.write('\n');

      expect(await exitCodePromise).toBe(0);
      const toml = tomlParse(readFileSync(codexConfigPath(), 'utf8')) as any;
      expect(toml.model_provider).toBe('vercel');
    });

    it('declining skips the agent and configures the rest', async () => {
      useUser();
      desktopState.codex = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      mkdirSync(join(home, '.codex'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0021',
        '--agent',
        'claude-code',
        '--agent',
        'codex'
      );

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput('Configure Codex anyway?');
      client.stdin.write('\n'); // default No
      await expect(client.stderr).toOutput('Skipped Codex');
      await expect(client.stderr).toOutput('Apply these changes?');
      client.stdin.write('\n');

      expect(await exitCodePromise).toBe(0);
      expect(existsSync(claudeSettingsPath())).toBe(true);
      // Codex was left completely untouched.
      expect(existsSync(codexConfigPath())).toBe(false);
      expect(existsSync(bashrcPath())).toBe(false);
    });

    it('declining the only agent ends the run before the key interview even starts', async () => {
      useTeam();
      useUser();
      useCreateApiKey();
      desktopState.codex = true;
      mkdirSync(join(home, '.codex'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'codex'
      );

      const exitCodePromise = aiGateway(client);
      // Consent is the FIRST question — declining costs no setup answers and
      // no team round trip.
      await expect(client.stderr).toOutput('Configure Codex anyway?');
      client.stdin.write('\n'); // default No

      expect(await exitCodePromise).toBe(0);
      await expect(client.stderr).toOutput('Nothing to configure');
      const stderr = client.stderr.getFullOutput();
      expect(stderr).not.toContain('use with your coding agents');
      expect(stderr).not.toContain('What team should the API key be under?');
      expect(stderr).not.toContain('Set a spend limit');
      expect(stderr).not.toContain('Set an expiration');
      // No key was minted for a run that configured nothing.
      expect(lastCreateBody).toBeUndefined();
      expect(existsSync(codexConfigPath())).toBe(false);
    });

    it('--yes with an explicit --agent consents but still warns', async () => {
      useUser();
      desktopState.codex = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--yes',
        '--key',
        'vck_DummyKey0022',
        '--agent',
        'codex'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        'The Codex desktop app will stop working'
      );
      expect(existsSync(codexConfigPath())).toBe(true);
    });

    it('--yes without naming the agent skips it with a hint', async () => {
      useUser();
      desktopState.codex = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      mkdirSync(join(home, '.codex'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--yes',
        '--key',
        'vck_DummyKey0023'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        'Pass --agent codex to configure it anyway'
      );
      expect(existsSync(claudeSettingsPath())).toBe(true);
      expect(existsSync(codexConfigPath())).toBe(false);
    });

    it('emits warnings in the JSON payload for an explicit agent', async () => {
      useUser();
      desktopState.codex = true;
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0024',
        '--agent',
        'codex'
      );

      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.status).toBe('ok');
      expect(out.warnings).toEqual([
        expect.objectContaining({ agent: 'codex', code: 'desktop_app_breaks' }),
      ]);
      expect(out.configured.length).toBeGreaterThan(0);
    });

    it('fails non-interactively with a self-contained payload when every detected agent needs consent', async () => {
      useUser();
      desktopState.codex = true;
      client.nonInteractive = true;
      mkdirSync(join(home, '.codex'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0025'
      );

      expect(await aiGateway(client)).toBe(1);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.status).toBe('error');
      // Not 'confirmation_required': --yes can't grant consent, so agents that
      // auto-retry confirmation failures with --yes must not loop here.
      expect(out.reason).toBe('requires_consent');
      expect(out.message).toContain('--agent codex');
      expect(out.warnings).toEqual([
        expect.objectContaining({ agent: 'codex', code: 'desktop_app_breaks' }),
      ]);
      expect(out.skipped).toEqual([
        expect.objectContaining({
          target: 'codex',
          reason: 'requires_consent',
        }),
      ]);
      // The suggested command replays the original invocation — same key
      // intent (redacted), same flags — with only the consent flags appended.
      expect(out.next[0].command).toBe(
        'vercel ai-gateway coding-agents setup --key <key> --agent codex'
      );
      // The suggested command must never carry key material.
      expect(JSON.stringify(out)).not.toContain('vck_');
      expect(existsSync(codexConfigPath())).toBe(false);
    });

    it('--all counts as explicit consent', async () => {
      useUser();
      desktopState.codex = true;
      client.nonInteractive = true;
      mkdirSync(join(home, '.codex'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--all',
        '--key',
        'vck_DummyKey0030'
      );

      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.status).toBe('ok');
      expect(out.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agent: 'codex',
            code: 'desktop_app_breaks',
          }),
        ])
      );
      expect(
        out.skipped.filter((s: any) => s.reason === 'requires_consent')
      ).toEqual([]);
      expect(existsSync(codexConfigPath())).toBe(true);
    });

    it('skips a detected-but-unnamed agent in JSON mode and configures the rest', async () => {
      useUser();
      desktopState.codex = true;
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      mkdirSync(join(home, '.codex'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0026'
      );

      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(
        out.skipped.some(
          (s: any) => s.target === 'codex' && s.reason === 'requires_consent'
        )
      ).toBe(true);
      // The skipped agent's structured warning code survives on the success
      // payload — consumers don't have to parse it out of skipped[].message.
      expect(out.warnings).toEqual([
        expect.objectContaining({ agent: 'codex', code: 'desktop_app_breaks' }),
      ]);
      expect(existsSync(claudeSettingsPath())).toBe(true);
      expect(existsSync(codexConfigPath())).toBe(false);
    });

    it('an interactive --yes dry run predicts the failure a real run would hit', async () => {
      useUser();
      keychainState.available = false;
      desktopState.codex = true;
      mkdirSync(join(home, '.codex'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--yes',
        '--dry-run',
        '--key',
        'vck_DummyKey0034'
      );

      expect(await aiGateway(client)).toBe(0);
      const stderr = client.stderr.getFullOutput();
      // The preview states the real outcome: a refusal, not a benign skip.
      expect(stderr).toContain('a real run would fail');
      expect(stderr).toContain('Pass --agent codex');
      expect(existsSync(codexConfigPath())).toBe(false);
    });

    it('carries warnings and consent skips through a JSON dry run', async () => {
      useUser();
      desktopState.codex = true;
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--dry-run',
        '--key',
        'vck_DummyKey0027',
        '--agent',
        'codex'
      );
      expect(await aiGateway(client)).toBe(0);
      const explicitOut = JSON.parse(client.stdout.getFullOutput());
      expect(explicitOut.reason).toBe('dry_run');
      expect(explicitOut.warnings).toHaveLength(1);

      const stdoutAfterFirst = client.stdout.getFullOutput().length;
      mkdirSync(join(home, '.claude'), { recursive: true });
      mkdirSync(join(home, '.codex'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--dry-run',
        '--key',
        'vck_DummyKey0027'
      );
      expect(await aiGateway(client)).toBe(0);
      const implicitOut = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(
        implicitOut.skipped.some((s: any) => s.reason === 'requires_consent')
      ).toBe(true);
      // The surviving agent's changes are still previewed…
      expect(implicitOut.changes.length).toBeGreaterThan(0);
      // …but none of the consent-skipped agent's.
      expect(
        implicitOut.changes.every((c: any) => !c.file.includes('.codex'))
      ).toBe(true);
    });

    it('warns during an interactive dry run without prompting', async () => {
      useUser();
      desktopState.codex = true;
      mkdirSync(join(home, '.codex'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--dry-run',
        '--key',
        'vck_DummyKey0028',
        '--agent',
        'codex'
      );

      expect(await aiGateway(client)).toBe(0);
      const stderr = client.stderr.getFullOutput();
      // The warning reads loss first, then the cause lines, then how to
      // revert — each cause sentence on its own line.
      const impactAt = stderr.indexOf(
        'The Codex desktop app will stop working'
      );
      const whyAt = stderr.indexOf('cannot use custom model providers');
      const whyLine2At = stderr.indexOf('\n  The Codex CLI keeps working.');
      // The undo instruction names the resolved file, not a bare filename.
      const undoAt = stderr.indexOf(
        `To undo: remove the model_provider line from ${codexConfigPath()}`
      );
      expect(impactAt).toBeGreaterThanOrEqual(0);
      expect(whyAt).toBeGreaterThan(impactAt);
      expect(whyLine2At).toBeGreaterThan(whyAt);
      expect(undoAt).toBeGreaterThan(whyLine2At);
      // The old single-paragraph warning is gone.
      expect(stderr).not.toContain('The Codex desktop app is installed');
      expect(stderr).not.toContain('Configure Codex anyway?');
      expect(existsSync(codexConfigPath())).toBe(false);
    });

    it('stays silent and additive when no desktop app is installed', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0029',
        '--agent',
        'codex'
      );

      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.warnings).toEqual([]);
      expect(client.stderr.getFullOutput()).not.toContain('desktop app');
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
});
