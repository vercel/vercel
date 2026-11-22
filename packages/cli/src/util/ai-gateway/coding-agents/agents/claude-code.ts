import { join } from 'node:path';
import type { CodingAgent, EnvExport } from '../types';
import { mergeJson, pathExists } from '../config-files';
import {
  GATEWAY_CLAUDE_CODE_BASE_URL,
  resolveGatewayBaseUrl,
} from '../gateway';
import { planClaudeDesktopSessionMigration } from '../migrations/claude-desktop-sessions';

/**
 * Claude Code reads env vars from the `env` object in `~/.claude/settings.json`.
 * It speaks the gateway's Anthropic-compatible endpoint, so the base URL has NO
 * `/v1` (the Anthropic SDK appends `/v1/messages`). `ANTHROPIC_API_KEY` must be
 * emptied because it takes precedence over `ANTHROPIC_AUTH_TOKEN`.
 *
 * Claude Code disables tool search when `ANTHROPIC_BASE_URL` is not
 * first-party, which loads every MCP tool schema into context on every turn.
 * The gateway forwards `tool_reference` blocks, so `ENABLE_TOOL_SEARCH`
 * overrides that default:
 * https://code.claude.com/docs/en/agent-sdk/tool-search#configure-tool-search
 *
 * With Keychain enabled we keep the token out of `settings.json` and export
 * `ANTHROPIC_AUTH_TOKEN` from the shell rc (resolved from the Keychain) instead,
 * so the secret never lands in the config file. Claude Code then reads the token
 * from its inherited environment.
 *
 * Docs: https://vercel.com/docs/ai-gateway/coding-agents/claude-code
 */
/** Config dir: `$CLAUDE_CONFIG_DIR` (Claude Code's own override) or `~/.claude`. */
export function claudeDir(home: string): string {
  const dir = process.env.CLAUDE_CONFIG_DIR;
  return dir && dir.trim() ? dir : join(home, '.claude');
}

export const claudeCode: CodingAgent = {
  id: 'claude-code',
  displayName: 'Claude Code',
  sessionMigration: {
    plan: ({ home }) => planClaudeDesktopSessionMigration(home),
  },

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
      ANTHROPIC_BASE_URL: resolveGatewayBaseUrl(
        ctx.baseUrlOverride,
        GATEWAY_CLAUDE_CODE_BASE_URL
      ),
      ANTHROPIC_API_KEY: '',
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
      ENABLE_TOOL_SEARCH: 'true',
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
          // When the token is written into the file (non-Keychain path, e.g.
          // always on Linux) restrict the file to 0600 so the gateway secret
          // isn't world/group-readable, matching the other secret-bearing agents.
          ...(ctx.useKeychain ? {} : { mode: 0o600 }),
          transform: current => mergeJson(current, { env }),
        },
      ],
      envExports,
      notes: [
        ...(ctx.useKeychain
          ? [
              'The Anthropic auth token is read from your shell environment (Keychain-backed).',
              'Open a new terminal so ANTHROPIC_AUTH_TOKEN is loaded, then restart Claude Code.',
            ]
          : ['Restart Claude Code to pick up the new settings.']),
        'The Claude Desktop app switches providers in its own settings (Developer → Configure Third-Party Inference…). After its first gateway launch, re-run this command to copy your existing desktop sessions over.',
      ],
    };
  },
};
