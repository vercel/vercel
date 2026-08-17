import { join } from 'node:path';
import { dump, load } from 'js-yaml';
import type { CodingAgent } from '../types';
import { pathExists } from '../config-files';
import {
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
} from '../gateway';

/**
 * Hermes reads providers from `~/.hermes/config.yaml`. `key_env` keeps the
 * key in the shell environment, and `discover_models` fills its picker from
 * the gateway catalog. YAML merges via a js-yaml round trip, which preserves
 * other entries but drops comments.
 */
const PROVIDER_KEY = 'vercel-ai-gateway';

type YamlObject = Record<string, unknown>;

function asObject(value: unknown): YamlObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as YamlObject)
    : {};
}

export const hermes: CodingAgent = {
  id: 'hermes',
  displayName: 'Hermes',

  async detect(home) {
    return pathExists(join(home, '.hermes'));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['hermes'] ?? join(ctx.home, '.hermes', 'config.yaml')
    );
  },

  buildPlan(ctx) {
    const path = this.configPath(ctx);
    const api = ctx.baseUrlOverride ?? GATEWAY_CODING_AGENT_BASE_URL;
    return {
      fileChanges: [
        {
          path,
          label: 'Hermes config',
          format: 'yaml',
          transform: current => {
            const config = asObject(load(current ?? '') ?? {});
            const providers = asObject(config.providers);
            providers[PROVIDER_KEY] = {
              ...asObject(providers[PROVIDER_KEY]),
              api,
              key_env: 'AI_GATEWAY_API_KEY',
              transport: 'chat_completions',
              discover_models: true,
            };
            config.providers = providers;
            config.model = {
              ...asObject(config.model),
              provider: `custom:${PROVIDER_KEY}`,
              default: GATEWAY_DEFAULT_MODEL,
            };
            return dump(config, { lineWidth: 120 });
          },
        },
      ],
      envExports: [{ name: 'AI_GATEWAY_API_KEY', value: ctx.apiKey }],
      notes: [
        `Hermes will use the gateway with ${GATEWAY_DEFAULT_MODEL}; switch models in-session with /model custom:${PROVIDER_KEY}:<gateway-model-id>.`,
        'Open a new terminal first so AI_GATEWAY_API_KEY is loaded.',
      ],
    };
  },
};
