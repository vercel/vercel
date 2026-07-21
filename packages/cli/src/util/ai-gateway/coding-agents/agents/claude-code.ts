import { join } from 'node:path';
import type { CodingAgent, EnvExport } from '../types';
import { mergeJson, pathExists } from '../config-files';
import { GATEWAY_ANTHROPIC_BASE_URL } from '../gateway';
import { keychainLookupCommand } from '../keychain';

/**
 * Claude Code reads env vars from the `env` object in `~/.claude/settings.json`.
 * It speaks the gateway's Anthropic-compatible endpoint, so the base URL has NO
 * `/v1` (the Anthropic SDK appends `/v1/messages`).
 *
 * With Keychain enabled we resolve the token through `apiKeyHelper` — a shell
 * command Claude Code runs in-process (via `/bin/sh`), reading the key from its
 * stdout — pointed at the Keychain lookup. The secret never lands in the config
 * file, and the token stays scoped to Claude Code's process rather than leaking
 * into every shell via a global export. `apiKeyHelper` sits at the bottom of
 * Claude Code's credential precedence ladder (below `ANTHROPIC_AUTH_TOKEN` and
 * `ANTHROPIC_API_KEY`), so we empty BOTH of those env vars in `settings.json` —
 * otherwise a stray one in the user's environment would outrank the helper and
 * the gateway routing would silently not take effect. Emptying them also stops
 * this setup from silently overriding a user's own `apiKeyHelper`.
 *
 * Without Keychain the token is embedded directly as `ANTHROPIC_AUTH_TOKEN` in
 * `settings.json` (still emptying `ANTHROPIC_API_KEY`, which outranks it).
 *
 * Docs: https://vercel.com/docs/ai-gateway/coding-agents/claude-code
 */
/** Config dir: `$CLAUDE_CONFIG_DIR` (Claude Code's own override) or `~/.claude`. */
function claudeDir(home: string): string {
  const dir = process.env.CLAUDE_CONFIG_DIR;
  return dir && dir.trim() ? dir : join(home, '.claude');
}

export const claudeCode: CodingAgent = {
  id: 'claude-code',
  displayName: 'Claude Code',

  async detect(home) {
    return pathExists(claudeDir(home));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['claude-code'] ??
      join(claudeDir(ctx.home), 'settings.json')
    );
  },

  buildPlan(ctx) {
    const path = this.configPath(ctx);
    const env: Record<string, string> = {
      ANTHROPIC_BASE_URL: GATEWAY_ANTHROPIC_BASE_URL,
      ANTHROPIC_API_KEY: '',
    };
    // Claude Code never touches the shell rc: it reads everything from
    // settings.json (the token via `apiKeyHelper` under Keychain, or embedded
    // directly otherwise), so no env exports are contributed.
    const envExports: EnvExport[] = [];
    const patch: Record<string, unknown> = { env };
    if (ctx.useKeychain) {
      env.ANTHROPIC_AUTH_TOKEN = '';
      patch.apiKeyHelper = keychainLookupCommand();
    } else {
      env.ANTHROPIC_AUTH_TOKEN = ctx.apiKey;
    }
    return {
      fileChanges: [
        {
          path,
          label: 'Claude Code settings',
          format: 'json',
          transform: current => mergeJson(current, patch),
        },
      ],
      envExports,
      notes: ctx.useKeychain
        ? [
            'Claude Code reads your AI Gateway key from the macOS Keychain via apiKeyHelper in settings.json — no new terminal or restart needed.',
          ]
        : ['Restart Claude Code to pick up the new settings.'],
    };
  },
};
