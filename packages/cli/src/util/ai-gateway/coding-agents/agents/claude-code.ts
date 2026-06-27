import { join } from 'node:path';
import type { CodingAgent, EnvExport } from '../types';
import { mergeJson, pathExists } from '../config-files';
import { GATEWAY_ANTHROPIC_BASE_URL } from '../gateway';

/**
 * Claude Code reads env vars from the `env` object in `~/.claude/settings.json`.
 * It speaks the gateway's Anthropic-compatible endpoint, so the base URL has NO
 * `/v1` (the Anthropic SDK appends `/v1/messages`). `ANTHROPIC_API_KEY` must be
 * emptied because it takes precedence over `ANTHROPIC_AUTH_TOKEN`.
 *
 * With Keychain enabled we keep the token out of `settings.json` and export
 * `ANTHROPIC_AUTH_TOKEN` from the shell rc (resolved from the Keychain) instead,
 * so the secret never lands in the config file. Claude Code then reads the token
 * from its inherited environment.
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
    const env: Record<string, string> = {
      ANTHROPIC_BASE_URL: GATEWAY_ANTHROPIC_BASE_URL,
      ANTHROPIC_API_KEY: '',
    };
    const envExports: EnvExport[] = [];
    if (ctx.useKeychain) {
      envExports.push({ name: 'ANTHROPIC_AUTH_TOKEN', value: ctx.apiKey });
    } else {
      env.ANTHROPIC_AUTH_TOKEN = ctx.apiKey;
    }
    return {
      fileChanges: [
        {
          path,
          label: 'Claude Code settings',
          format: 'json',
          transform: current => mergeJson(current, { env }),
        },
      ],
      envExports,
      notes: ctx.useKeychain
        ? [
            'The Anthropic auth token is read from your shell environment (Keychain-backed).',
            'Open a new terminal so ANTHROPIC_AUTH_TOKEN is loaded, then restart Claude Code.',
          ]
        : ['Restart Claude Code to pick up the new settings.'],
    };
  },
};
