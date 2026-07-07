import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { claudeCode } from '../../../../src/util/ai-gateway/coding-agents/agents/claude-code';
import { codex } from '../../../../src/util/ai-gateway/coding-agents/agents/codex';

// The gateway-key keychain stays out of the picture (no keychain prompts,
// even on macOS dev machines). Login detection itself never touches the
// Keychain, so nothing else needs simulating.
vi.mock(
  '../../../../src/util/ai-gateway/coding-agents/keychain',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../../../src/util/ai-gateway/coding-agents/keychain')
      >();
    return {
      ...actual,
      isKeychainAvailable: () => false,
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

let home: string;
let savedEnv: Record<string, string | undefined>;

function claudeSettingsPath() {
  return join(home, '.claude', 'settings.json');
}
function codexConfigPath() {
  return join(home, '.codex', 'config.toml');
}

/** Simulate an Anthropic `/login` session (the Linux/WSL credential file). */
function loginClaude(dir = join(home, '.claude')) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, '.credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'not-a-real-token' } })
  );
}

/** Simulate a Codex ChatGPT/OpenAI login (`auth.json` in the Codex dir). */
function loginCodex(dir = join(home, '.codex')) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'auth.json'),
    JSON.stringify({ OPENAI_API_KEY: null, tokens: {} })
  );
}

beforeEach(() => {
  desktopState.codex = false;
  home = mkdtempSync(join(tmpdir(), 'vc-setup-agents-logins-'));
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

describe('ai-gateway coding-agents setup — pre-existing logins', () => {
  describe('Claude Code (anthropic_login_conflict)', () => {
    it('interactive: declining skips Claude Code and leaves settings.json untouched', async () => {
      useUser();
      loginClaude();
      writeFileSync(claudeSettingsPath(), JSON.stringify({ model: 'opus' }));
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0001',
        '--agent',
        'claude-code'
      );

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        'Your Anthropic login will stop being used'
      );
      await expect(client.stderr).toOutput(
        'Claude Code is logged in with an Anthropic account'
      );
      await expect(client.stderr).toOutput('Configure Claude Code anyway?');
      client.stdin.write('\n'); // default No
      await expect(client.stderr).toOutput('Skipped Claude Code');

      expect(await exitCodePromise).toBe(0);
      await expect(client.stderr).toOutput('Nothing to configure');
      expect(JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'))).toEqual({
        model: 'opus',
      });
    });

    it('interactive: accepting configures Claude Code', async () => {
      useUser();
      loginClaude();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0002',
        '--agent',
        'claude-code'
      );

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput('Configure Claude Code anyway?');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('Apply these changes?');
      client.stdin.write('\n');

      expect(await exitCodePromise).toBe(0);
      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('vck_LoginKey0002');
    });

    it('non-interactive without naming the agent skips it with requires_consent', async () => {
      useUser();
      client.nonInteractive = true;
      loginClaude();
      // A second detected agent (not logged in) survives the consent filter.
      mkdirSync(join(home, '.codex'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0003'
      );

      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput());
      const skip = out.skipped.find((s: any) => s.target === 'claude-code');
      expect(skip.reason).toBe('requires_consent');
      expect(skip.message).toContain('/logout inside Claude Code');
      // The undo instruction names the file the entries would land in.
      expect(skip.message).toContain(claudeSettingsPath());
      expect(skip.message).toContain(
        'Pass --agent claude-code to configure it anyway'
      );
      // The skipped agent's structured warning code stays recoverable.
      expect(out.warnings).toEqual([
        expect.objectContaining({
          agent: 'claude-code',
          code: 'anthropic_login_conflict',
        }),
      ]);
      expect(existsSync(claudeSettingsPath())).toBe(false);
      expect(existsSync(codexConfigPath())).toBe(true);
    });

    it('fails with a self-contained payload when every detected agent needs consent', async () => {
      useUser();
      client.nonInteractive = true;
      loginClaude();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0004'
      );

      expect(await aiGateway(client)).toBe(1);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.status).toBe('error');
      expect(out.reason).toBe('requires_consent');
      // The message names the exact flags, not a placeholder.
      expect(out.message).toContain('--agent claude-code');
      // Structured warnings and skip entries travel with the failure — a JSON
      // consumer never has to fish them out of stderr.
      expect(out.warnings).toEqual([
        expect.objectContaining({
          agent: 'claude-code',
          code: 'anthropic_login_conflict',
        }),
      ]);
      expect(out.skipped).toEqual([
        expect.objectContaining({
          target: 'claude-code',
          reason: 'requires_consent',
        }),
      ]);
      // The suggested command replays the original invocation (redacted key
      // and all) with the consent flags appended.
      expect(out.next[0].command).toBe(
        'vercel ai-gateway coding-agents setup --key <key> --agent claude-code'
      );
      // No key material anywhere in the payload or suggested command.
      expect(JSON.stringify(out)).not.toContain('vck_');
      expect(existsSync(claudeSettingsPath())).toBe(false);
    });

    it('explicit --agent claude-code consents: warns in JSON but configures', async () => {
      useUser();
      client.nonInteractive = true;
      loginClaude();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0005',
        '--agent',
        'claude-code'
      );

      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.status).toBe('ok');
      expect(out.warnings).toEqual([
        expect.objectContaining({
          agent: 'claude-code',
          code: 'anthropic_login_conflict',
        }),
      ]);
      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('vck_LoginKey0005');
    });

    it('a bare ~/.claude dir with settings.json is not a login (regression canary)', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(claudeSettingsPath(), '{}');
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0006',
        '--agent',
        'claude-code'
      );

      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.status).toBe('ok');
      expect(out.warnings).toEqual([]);
      expect(out.configured.length).toBeGreaterThan(0);
    });

    it('an oauthAccount record in ~/.claude.json counts as a login', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(
        join(home, '.claude.json'),
        JSON.stringify({ oauthAccount: { emailAddress: 'dev@example.com' } })
      );
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0007',
        '--agent',
        'claude-code'
      );

      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.warnings).toEqual([
        expect.objectContaining({ code: 'anthropic_login_conflict' }),
      ]);
    });

    it('a ~/.claude.json without oauthAccount (or malformed) is not a login', async () => {
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(
        join(home, '.claude.json'),
        JSON.stringify({ hasCompletedOnboarding: true })
      );
      expect(await claudeCode.warnings!({ home })).toEqual([]);

      writeFileSync(join(home, '.claude.json'), 'not json {');
      expect(await claudeCode.warnings!({ home })).toEqual([]);
    });

    it('an emptied oauthAccount record left by a logout is not a login', async () => {
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(
        join(home, '.claude.json'),
        JSON.stringify({ oauthAccount: {} })
      );
      expect(await claudeCode.warnings!({ home })).toEqual([]);

      writeFileSync(
        join(home, '.claude.json'),
        JSON.stringify({ oauthAccount: { emailAddress: '' } })
      );
      expect(await claudeCode.warnings!({ home })).toEqual([]);
    });

    it('honors CLAUDE_CONFIG_DIR for login detection and the undo path', async () => {
      const custom = join(home, 'custom-claude');
      loginClaude(custom);
      process.env.CLAUDE_CONFIG_DIR = custom;
      const warnings = await claudeCode.warnings!({ home });
      expect(warnings).toHaveLength(1);
      // The undo instruction names the file setup would actually write.
      expect(warnings[0].undo).toContain(join(custom, 'settings.json'));

      // The default location has no credentials, so no warning without the
      // override.
      delete process.env.CLAUDE_CONFIG_DIR;
      expect(await claudeCode.warnings!({ home })).toEqual([]);
    });
  });

  describe('Codex (openai_login_conflict)', () => {
    it('an auth.json login emits the warning but an explicit --agent proceeds', async () => {
      useUser();
      client.nonInteractive = true;
      loginCodex();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0008',
        '--agent',
        'codex'
      );

      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.status).toBe('ok');
      expect(out.warnings).toEqual([
        expect.objectContaining({
          agent: 'codex',
          code: 'openai_login_conflict',
        }),
      ]);
      expect(existsSync(codexConfigPath())).toBe(true);
    });

    it('composes with the desktop-app warning as two entries', async () => {
      useUser();
      client.nonInteractive = true;
      desktopState.codex = true;
      loginCodex();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0009',
        '--agent',
        'codex'
      );

      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.warnings).toEqual([
        expect.objectContaining({ agent: 'codex', code: 'desktop_app_breaks' }),
        expect.objectContaining({
          agent: 'codex',
          code: 'openai_login_conflict',
        }),
      ]);
    });

    it('a bare ~/.codex dir without auth.json is not a login', async () => {
      mkdirSync(join(home, '.codex'), { recursive: true });
      expect(await codex.warnings!({ home })).toEqual([]);
    });

    it('honors CODEX_HOME for login detection', async () => {
      const custom = join(home, 'custom-codex');
      loginCodex(custom);
      process.env.CODEX_HOME = custom;
      expect(await codex.warnings!({ home })).toHaveLength(1);

      delete process.env.CODEX_HOME;
      expect(await codex.warnings!({ home })).toEqual([]);
    });
  });

  describe('consent interactions', () => {
    it('dry-run without naming the agent reports the skip instead of failing', async () => {
      useUser();
      client.nonInteractive = true;
      loginClaude();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--dry-run',
        '--key',
        'vck_LoginKey0010'
      );

      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.reason).toBe('dry_run');
      expect(out.changes).toEqual([]);
      const skip = out.skipped.find((s: any) => s.target === 'claude-code');
      expect(skip.reason).toBe('requires_consent');
      // The dry-run payload keeps the skipped agent's warning code, so a
      // consumer can tell a login conflict from a breaking desktop app.
      expect(out.warnings).toEqual([
        expect.objectContaining({
          agent: 'claude-code',
          code: 'anthropic_login_conflict',
        }),
      ]);
      expect(existsSync(claudeSettingsPath())).toBe(false);
    });

    it('an already-configured re-run stays a successful no-op after a login appears', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      // Configure first (explicit --agent counts as consent)…
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0011',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(0);
      const stdoutAfterFirst = client.stdout.getFullOutput().length;
      const configured = readFileSync(claudeSettingsPath(), 'utf8');

      // …then a login appears and automation re-runs without --agent.
      loginClaude();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0011'
      );
      expect(await aiGateway(client)).toBe(0);

      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.status).toBe('ok');
      expect(out.reason).toBe('already_configured');
      // Nothing was verified as configured this run, so the message doesn't
      // claim the agents were — and doesn't advertise a dead --reconfigure.
      expect(out.message).toContain(
        'existing configuration already uses the AI Gateway'
      );
      expect(out.message).not.toContain('--reconfigure');
      const skip = out.skipped.find((s: any) => s.target === 'claude-code');
      expect(skip.reason).toBe('requires_consent');
      // The config was not touched by the consent-skipped re-run.
      expect(readFileSync(claudeSettingsPath(), 'utf8')).toBe(configured);
    });

    it('a would-be change still requires consent on re-run (different key)', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0012',
        '--agent',
        'claude-code'
      );
      expect(await aiGateway(client)).toBe(0);
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      loginClaude();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_Rotated0012'
      );

      expect(await aiGateway(client)).toBe(1);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.status).toBe('error');
      expect(out.reason).toBe('requires_consent');
      // The old key survives — rotation of a warned agent needs --agent.
      expect(readFileSync(claudeSettingsPath(), 'utf8')).toContain(
        'vck_LoginKey0012'
      );
    });

    it('reports the remaining agents as already configured when one is consent-skipped', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      mkdirSync(join(home, '.codex'), { recursive: true });
      // Configure both agents while nothing needs consent.
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0015'
      );
      expect(await aiGateway(client)).toBe(0);
      const stdoutAfterFirst = client.stdout.getFullOutput().length;
      const bashrc = readFileSync(join(home, '.bashrc'), 'utf8');
      expect(bashrc).toContain('AI_GATEWAY_API_KEY');

      // Codex signs in; the same re-run stays a no-op that doesn't claim the
      // skipped agent was configured — and keeps its shell export.
      loginCodex();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0015'
      );
      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(
        client.stdout.getFullOutput().slice(stdoutAfterFirst)
      );
      expect(out.reason).toBe('already_configured');
      expect(out.message).toContain(
        'The remaining agents are already configured'
      );
      expect(out.skipped).toEqual([
        expect.objectContaining({
          target: 'codex',
          reason: 'requires_consent',
        }),
      ]);
      expect(readFileSync(join(home, '.bashrc'), 'utf8')).toBe(bashrc);
    });

    it('asks once per agent when it carries multiple warnings', async () => {
      useUser();
      desktopState.codex = true;
      loginCodex();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_LoginKey0013',
        '--agent',
        'codex'
      );

      const exitCodePromise = aiGateway(client);
      await expect(client.stderr).toOutput(
        'The Codex desktop app will stop working'
      );
      await expect(client.stderr).toOutput(
        'Codex is signed in with a ChatGPT or OpenAI account'
      );
      await expect(client.stderr).toOutput('Configure Codex anyway?');
      client.stdin.write('\n'); // one decline covers the whole agent

      expect(await exitCodePromise).toBe(0);
      const stderr = client.stderr.getFullOutput();
      // Both warnings share one prompt — asked exactly once. The answered
      // re-render repeats the question text, so count unanswered renders.
      expect(stderr.match(/\(y\/N\)/g)).toHaveLength(1);
      expect(stderr.match(/Skipped Codex/g)).toHaveLength(1);
      expect(existsSync(codexConfigPath())).toBe(false);
    });

    it('dedupes the requires_consent skip for an agent with multiple warnings', async () => {
      useUser();
      client.nonInteractive = true;
      desktopState.codex = true;
      loginCodex();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--dry-run',
        '--key',
        'vck_LoginKey0014'
      );

      expect(await aiGateway(client)).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput());
      const codexSkips = out.skipped.filter((s: any) => s.target === 'codex');
      expect(codexSkips).toHaveLength(1);
      // One entry carries both warnings and a single hint.
      expect(codexSkips[0].message).toContain('desktop app');
      expect(codexSkips[0].message).toContain('signed in with a ChatGPT');
      expect(codexSkips[0].message.match(/Pass --agent codex/g)).toHaveLength(
        1
      );
    });
  });
});
