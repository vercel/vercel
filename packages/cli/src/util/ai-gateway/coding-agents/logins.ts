import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Best-effort detection of pre-existing agent logins that would conflict with
 * the gateway setup. Same philosophy as `desktop-apps.ts`: cheap local checks,
 * a missed detection only means no warning, and nothing here ever throws.
 * Detection keys on credential artifacts only — never on the mere existence of
 * a config directory, which agents create on first launch regardless of login.
 * False positives are the expensive direction (needless consent friction,
 * skipped agents in automation), so every signal must assert a live login —
 * presence of a container that merely COULD hold one is not enough.
 */

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * True when Claude Code has an Anthropic `/login` session: `~/.claude.json`
 * (or `$CLAUDE_CONFIG_DIR/.claude.json`) keeps an `oauthAccount` record while
 * logged in, and on Linux/WSL the OAuth credentials live in
 * `.credentials.json` inside the config dir.
 *
 * The `Claude Code-credentials` macOS Keychain item is deliberately NOT
 * probed: it is Claude Code's general credential store (Console keys,
 * Bedrock/Vertex/gateway tokens, logged-out husks all live there too), its
 * mere existence says nothing about a live Anthropic login, and verifying its
 * content would require reading the secret behind a Keychain ACL prompt.
 * Likewise a bare or emptied `oauthAccount` record does not count — only one
 * that still names an account.
 */
export function hasClaudeCodeLogin(home: string, claudeDir: string): boolean {
  try {
    if (existsSync(join(claudeDir, '.credentials.json'))) {
      return true;
    }
    for (const path of [
      join(home, '.claude.json'),
      join(claudeDir, '.claude.json'),
    ]) {
      const account = readJson(path)?.oauthAccount;
      if (
        typeof account === 'object' &&
        account !== null &&
        Boolean(
          (account as Record<string, unknown>).emailAddress ||
            (account as Record<string, unknown>).accountUuid
        )
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * True when Codex is signed in: `auth.json` in the Codex dir holds either
 * ChatGPT OAuth tokens or a stored OPENAI_API_KEY.
 */
export function hasCodexLogin(codexDir: string): boolean {
  try {
    return existsSync(join(codexDir, 'auth.json'));
  } catch {
    return false;
  }
}
