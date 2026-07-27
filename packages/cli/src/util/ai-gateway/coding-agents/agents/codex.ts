import { join } from 'node:path';
import type { AgentWarning, CodingAgent } from '../types';
import { mergeToml, pathExists, removeTomlKeys } from '../config-files';
import { isMacAppInstalled } from '../desktop-apps';
import { GATEWAY_CODEX_BASE_URL, GATEWAY_API_KEY_ENV } from '../gateway';

/** The Codex desktop app shares `~/.codex/config.toml` with the CLI. */
const CODEX_DESKTOP_APP = 'Codex.app';

/**
 * Codex reads `~/.codex/config.toml`. We add a `vercel` model provider pointing
 * at the gateway's OpenAI-compatible base URL and make it the default provider
 * via the top-level `model_provider` (the top-level `profile = "..."` key is
 * rejected by current Codex). We deliberately do NOT pin a `model` — the user
 * keeps choosing their own. `wire_api` MUST be `responses` — Codex removed Chat
 * Completions support, and the gateway serves the Responses API at
 * `/v1/responses`. Command-backed auth makes Codex fetch the provider's remote
 * model catalog for `/model`; `env_key` auth only exposes Codex's bundled
 * models. The command reads the key from the environment, so the key itself
 * never lands in the TOML and we continue to export it via the shell rc.
 *
 * Docs: https://vercel.com/docs/ai-gateway/coding-agents/openai-codex
 */
/** Config dir: `$CODEX_HOME` (Codex's own override) or `~/.codex`. */
function codexDir(home: string): string {
  const dir = process.env.CODEX_HOME;
  return dir && dir.trim() ? dir : join(home, '.codex');
}

export function codexAuthConfig(platform: NodeJS.Platform = process.platform): {
  command: string;
  args: string[];
  refresh_interval_ms: number;
} {
  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `[Console]::Out.Write($env:${GATEWAY_API_KEY_ENV})`,
      ],
      refresh_interval_ms: 0,
    };
  }
  return {
    command: '/bin/sh',
    args: ['-c', `printf '%s' "$${GATEWAY_API_KEY_ENV}"`],
    refresh_interval_ms: 0,
  };
}

export const codex: CodingAgent = {
  id: 'codex',
  displayName: 'Codex',

  async detect(home) {
    return pathExists(codexDir(home));
  },

  async warnings({ home, overrides }) {
    const warnings: AgentWarning[] = [];
    if (isMacAppInstalled(CODEX_DESKTOP_APP, home)) {
      const configPath = this.configPath({ apiKey: '', home, overrides });
      warnings.push({
        code: 'desktop_app_breaks',
        impact: 'The Codex desktop app will stop working.',
        why: [
          'The desktop app is installed and cannot use custom model providers, and connecting sets model_provider = "vercel" in the config.toml the app shares with the CLI.',
          'The Codex CLI keeps working.',
        ],
        undo: `remove the model_provider line from ${configPath}`,
        confirm: 'Configure Codex anyway?',
      });
    }
    return warnings;
  },

  configPath(ctx) {
    return ctx.overrides?.['codex'] ?? join(codexDir(ctx.home), 'config.toml');
  },

  buildPlan(ctx) {
    const path = this.configPath(ctx);
    return {
      fileChanges: [
        {
          path,
          label: 'Codex config',
          format: 'toml',
          transform: current => {
            const withoutEnvKey = removeTomlKeys(current, [
              ['model_providers', 'vercel', 'env_key'],
            ]);
            return mergeToml(withoutEnvKey, {
              model_provider: 'vercel',
              model_providers: {
                vercel: {
                  name: 'Vercel AI Gateway',
                  base_url: GATEWAY_CODEX_BASE_URL,
                  auth: codexAuthConfig(),
                  wire_api: 'responses',
                },
              },
            });
          },
        },
      ],
      envExports: [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }],
      notes: [
        'Codex now defaults to the Vercel AI Gateway; pick a model with /model, --model, or in config.',
        `Open a new terminal so ${GATEWAY_API_KEY_ENV} is loaded, or run: export ${GATEWAY_API_KEY_ENV}=<key>`,
      ],
    };
  },
};
