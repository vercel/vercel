import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeToml, pathExists } from '../config-files';
import { GATEWAY_OPENAI_BASE_URL, GATEWAY_API_KEY_ENV } from '../gateway';

/**
 * Codex reads `~/.codex/config.toml`. We add a `vercel` model provider pointing
 * at the gateway's OpenAI-compatible base URL and make it the default provider
 * via the top-level `model_provider` (the top-level `profile = "..."` key is
 * rejected by current Codex). We deliberately do NOT pin a `model` — the user
 * keeps choosing their own. `wire_api` MUST be `responses` — Codex removed Chat
 * Completions support, and the gateway serves the Responses API at
 * `/v1/responses`. The key itself never lands in the TOML; `env_key` names an env
 * var Codex reads at runtime, so we also export it via the shell rc.
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
          transform: current =>
            mergeToml(current, {
              model_provider: 'vercel',
              model_providers: {
                vercel: {
                  name: 'Vercel AI Gateway',
                  base_url: GATEWAY_OPENAI_BASE_URL,
                  env_key: GATEWAY_API_KEY_ENV,
                  wire_api: 'responses',
                },
              },
            }),
        },
      ],
      envExports: [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }],
      notes: [
        'Codex now defaults to the Vercel AI Gateway; pick a model with --model or in config.',
        `Open a new terminal so ${GATEWAY_API_KEY_ENV} is loaded, or run: export ${GATEWAY_API_KEY_ENV}=<key>`,
      ],
    };
  },
};
