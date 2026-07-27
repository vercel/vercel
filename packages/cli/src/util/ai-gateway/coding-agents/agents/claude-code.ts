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
