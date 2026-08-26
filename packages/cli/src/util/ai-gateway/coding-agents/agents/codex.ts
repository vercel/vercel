import { join } from 'node:path';
import type { AgentWarning, CodingAgent, EnvExport } from '../types';
import { mergeToml, pathExists, removeTomlPath } from '../config-files';
import { isMacAppInstalled } from '../desktop-apps';
import { keychainAuthCommand } from '../keychain';
import {
  GATEWAY_CODEX_BASE_URL,
  GATEWAY_API_KEY_ENV,
  resolveGatewayBaseUrl,
} from '../gateway';

/** The Codex desktop app shares `~/.codex/config.toml` with the CLI. */
const CODEX_DESKTOP_APP = 'Codex.app';

/**
 * Codex reads `~/.codex/config.toml`. We add a `vercel` model provider pointing
 * at the gateway's OpenAI-compatible base URL and make it the default provider
 * via the top-level `model_provider` (the top-level `profile = "..."` key is
 * rejected by current Codex). We deliberately do NOT pin a `model` — the user
 * keeps choosing their own. `wire_api` MUST be `responses` — Codex removed Chat
 * Completions support, and the gateway serves the Responses API at
 * `/v1/responses`.
 *
 * Codex 0.118.0+ can read the Keychain through provider `auth`; older versions
 * use `env_key` and a shell export. The two settings are mutually exclusive.
 *
 * Docs: https://vercel.com/docs/ai-gateway/coding-agents/openai-codex
 */
/** Config dir: `$CODEX_HOME` (Codex's own override) or `~/.codex`. */
function codexDir(home: string): string {
  const dir = process.env.CODEX_HOME;
  return dir && dir.trim() ? dir : join(home, '.codex');
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
    const useAuthCommand =
      Boolean(ctx.useKeychain) && ctx.codexSupportsAuthCommand !== false;
    const provider: Record<string, unknown> = {
      name: 'Vercel AI Gateway',
      base_url: resolveGatewayBaseUrl(
        ctx.baseUrlOverride,
        GATEWAY_CODEX_BASE_URL
      ),
      wire_api: 'responses',
    };
    if (useAuthCommand) {
      const { command, args } = keychainAuthCommand();
      provider.auth = {
        command,
        args,
        timeout_ms: 5000,
        refresh_interval_ms: 300000,
      };
    } else {
      provider.env_key = GATEWAY_API_KEY_ENV;
    }
    const envExports: EnvExport[] = useAuthCommand
      ? []
      : [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }];
    return {
      fileChanges: [
        {
          path,
          label: 'Codex config',
          format: 'toml',
          transform: current => {
            const merged = mergeToml(current, {
              model_provider: 'vercel',
              model_providers: { vercel: provider },
            });
            return removeTomlPath(merged, [
              'model_providers',
              'vercel',
              useAuthCommand ? 'env_key' : 'auth',
            ]);
          },
        },
      ],
      envExports,
      notes: [
        'Codex now defaults to the Vercel AI Gateway; pick a model with --model or in config.',
        useAuthCommand
          ? 'Codex reads the key from the macOS Keychain; restart Codex to pick up the new config.'
          : `Open a new terminal so ${GATEWAY_API_KEY_ENV} is loaded, or run: export ${GATEWAY_API_KEY_ENV}=<key>`,
      ],
    };
  },
};
