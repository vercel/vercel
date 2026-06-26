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
export const claudeCode: CodingAgent = {
  id: 'claude-code',
  displayName: 'Claude Code',

  async detect(home) {
    return pathExists(join(home, '.claude'));
  },

  buildPlan(ctx) {
    const path = join(ctx.home, '.claude', 'settings.json');
    return {
      fileChanges: [
        {
          path,
          label: 'Claude Code settings',
          format: 'json',
          transform: current =>
            mergeJson(current, {
              env: {
                ANTHROPIC_BASE_URL: GATEWAY_ANTHROPIC_BASE_URL,
                ANTHROPIC_AUTH_TOKEN: ctx.apiKey,
                ANTHROPIC_API_KEY: '',
              },
            }),
        },
      ],
      envExports: [],
      notes: ['Restart Claude Code to pick up the new settings.'],
    };
  },
};
