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
function opencodeConfigPath() {
  return join(home, '.config', 'opencode', 'opencode.json');
}
function bashrcPath() {
  return join(home, '.bashrc');
}
function piAuthPath() {
  return join(home, '.pi', 'agent', 'auth.json');
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'vc-setup-agents-'));
  savedEnv = {
    HOME: process.env.HOME,
    SHELL: process.env.SHELL,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  };
  process.env.HOME = home;
  process.env.SHELL = '/bin/bash';
  delete process.env.XDG_CONFIG_HOME;
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

describe('ai-gateway setup-coding-agents', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'setup-coding-agents', '--help');
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
        'setup-coding-agents',
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
        'setup-coding-agents',
        '--key',
        'vck_DummyKey0002',
        '--agent',
        'codex'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const toml = tomlParse(readFileSync(codexConfigPath(), 'utf8')) as any;
      expect(toml.model_provider).toBe('vercel');
      expect(toml.model).toBe('anthropic/claude-sonnet-4.5');
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
      // A (hypothetical) key with shell-significant characters must not break the rc file.
      const trickyKey = 'vck_a$b`c\'d"e';
      client.setArgv(
        'ai-gateway',
        'setup-coding-agents',
        '--key',
        trickyKey,
        '--agent',
        'codex'
      );

      expect(await aiGateway(client)).toBe(0);
      const bashrc = readFileSync(bashrcPath(), 'utf8');
      // Single-quoted, with the embedded single quote emitted via the '\'' idiom,
      // so a POSIX shell reconstructs the exact original value.
      expect(bashrc).toContain(
        `export AI_GATEWAY_API_KEY='vck_a$b\`c'\\''d"e'`
      );
    });

    it('configures OpenCode with the native vercel provider', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup-coding-agents',
        '--key',
        'vck_DummyKey0003',
        '--agent',
        'opencode',
        '--model',
        'anthropic/claude-opus-4.7'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const cfg = JSON.parse(readFileSync(opencodeConfigPath(), 'utf8'));
      expect(cfg.provider.vercel.options.apiKey).toBe('vck_DummyKey0003');
      expect(cfg.model).toBe('vercel/anthropic/claude-opus-4.7');
    });

    it('configures Pi via the native vercel-ai-gateway auth entry (0600)', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup-coding-agents',
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
      // Credential file must be user-only readable.
      expect(statSync(piAuthPath()).mode & 0o777).toBe(0o600);
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
        'setup-coding-agents',
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
        'setup-coding-agents',
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

    it('prompts for a team when a key would be created', async () => {
      useUser();
      useTeam();
      client.setArgv(
        'ai-gateway',
        'setup-coding-agents',
        '--dry-run',
        '--agent',
        'claude-code'
      );

      const exitCodePromise = aiGateway(client);

      // The dry-run notice comes up front, before any prompts.
      await expect(client.stderr).toOutput('previewing changes only');
      await expect(client.stderr).toOutput(
        'API key to use with your coding agents'
      );
      client.stdin.write('\r');

      await expect(client.stderr).toOutput('Dry run');
      expect(await exitCodePromise).toBe(0);
      // Still a preview: nothing is written and no key is minted.
      expect(existsSync(claudeSettingsPath())).toBe(false);
    });

    it('prompts even when a team is already selected', async () => {
      const team = useTeam();
      useUser();
      // A scope is already pinned, but key ownership is still an explicit choice.
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'setup-coding-agents',
        '--dry-run',
        '--agent',
        'claude-code'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'API key to use with your coding agents'
      );
      client.stdin.write('\r');

      await expect(client.stderr).toOutput('Dry run');
      expect(await exitCodePromise).toBe(0);
      expect(existsSync(claudeSettingsPath())).toBe(false);
    });

    it('does not require a scope in non-interactive mode', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'setup-coding-agents',
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
        'setup-coding-agents',
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

  describe('idempotency', () => {
    it('is a no-op on the second run with the same key', async () => {
      useUser();
      client.nonInteractive = true;
      const argv = [
        'ai-gateway',
        'setup-coding-agents',
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
        'setup-coding-agents',
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

    it('masks the key in the diff but prints it raw on stdout (interactive)', async () => {
      useUser();
      const secret = 'vck_SuperSecretValue98765';
      client.setArgv(
        'ai-gateway',
        'setup-coding-agents',
        '--key',
        secret,
        '--agent',
        'claude-code',
        '--yes'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('••••');
      expect(stderr).not.toContain(secret);

      // The key is still emitted in full on stdout for piping.
      expect(client.stdout.getFullOutput()).toContain(secret);
    });
  });

  describe('validation', () => {
    it('rejects a negative budget', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'setup-coding-agents',
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
        'setup-coding-agents',
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
