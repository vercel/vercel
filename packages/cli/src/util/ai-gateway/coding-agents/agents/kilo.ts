import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeJson, pathExists } from '../config-files';

/**
 * Kilo Code's CLI reads a global config at `~/.config/kilo/kilo.json[c]`
 * (an OpenCode fork, but with its own provider registry). We add the
 * gateway as an `openai-compatible` provider. The `{env:VAR}` reference is
 * Kilo's own substitution syntax, resolved only for configs in trusted
 * locations (the global config is one), so the key never lands in the file —
 * it stays in the shell environment we export.
 *
 * Kilo auto-fetches the model list from the base URL's /models endpoint, so
 * no per-model declarations are needed; users pick with /models in a session.
 *
 * Docs: https://kilo.ai/docs/ai-providers/openai-compatible
 */
function kiloConfigDir(home: string): string {
  return join(home, '.config', 'kilo');
}

export const kilo: CodingAgent = {
  id: 'kilo',
  displayName: 'Kilo Code',
  experimental: true,

  async detect(home) {
    return pathExists(kiloConfigDir(home));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['kilo'] ?? join(kiloConfigDir(ctx.home), 'kilo.json')
    );
  },

  buildPlan(ctx) {
    const path = this.configPath(ctx);
    const baseURL = ctx.baseUrlOverride ?? 'https://ai-gateway.vercel.sh/v1';
    return {
      fileChanges: [
        {
          path,
          label: 'Kilo Code config',
          format: 'json',
          transform: current =>
            mergeJson(current, {
              provider: {
                'openai-compatible': {
                  options: {
                    // Kilo resolves {env:…} itself; the literal key never
                    // enters the file.
                    apiKey: '{env:AI_GATEWAY_API_KEY}',
                    baseURL,
                  },
                },
              },
            }),
        },
      ],
      envExports: [{ name: 'AI_GATEWAY_API_KEY', value: ctx.apiKey }],
      notes: [
        'Kilo Code lists the gateway catalog automatically — pick a model with /models in a session (ids look like openai-compatible/anthropic/claude-fable-5).',
        'If you keep your Kilo config in kilo.jsonc instead of kilo.json, merge the new provider block into it manually.',
      ],
    };
  },
};
