import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeJson, pathExists } from '../config-files';
import { GATEWAY_ANTHROPIC_BASE_URL } from '../gateway';

/**
 * Claude Code reads env vars from the `env` object in `~/.claude/settings.json`.
 * It speaks the gateway's Anthropic-compatible endpoint, so the base URL has NO
 * `/v1` (the Anthropic SDK appends `/v1/messages`). `ANTHROPIC_API_KEY` must be
 * emptied because it takes precedence over `ANTHROPIC_AUTH_TOKEN`.
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
      ANTHROPIC_AUTH_TOKEN: ctx.apiKey,
    };
    return {
      fileChanges: [
        {
          path,
          label: 'Claude Code settings',
          format: 'json',
          transform: current => mergeJson(current, { env }),
        },
      ],
      envExports: [],
      notes: ['Restart Claude Code to pick up the new settings.'],
    };
  },
};
