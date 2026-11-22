import { dirname, join } from 'node:path';
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml';
import type { CodingAgent } from '../types';
import { pathExists } from '../config-files';
import {
  GATEWAY_API_KEY_ENV,
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
} from '../gateway';

const PROVIDER_ID = 'vercel-ai-gateway';

type AnyObject = Record<string, unknown>;

function asObject(value: unknown): AnyObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyObject)
    : {};
}

function upsertById(
  list: unknown[],
  merge: (existing: AnyObject) => AnyObject
): unknown[] {
  const index = list.findIndex(item => asObject(item).id === PROVIDER_ID);
  const merged = { id: PROVIDER_ID, ...merge(asObject(list[index])) };
  return index === -1
    ? [...list, merged]
    : list.map((item, i) => (i === index ? merged : item));
}

// ForgeCode reads ~/.forge/.forge.toml — a [[providers]] entry plus [session]
// defaults. Forge 2.13+ resolves keys only from the sibling .credentials.json
// (0600), never env; api_key_vars kept for older releases.
export const forge: CodingAgent = {
  id: 'forge',
  needsTopModels: true,
  displayName: 'ForgeCode',

  async detect(home) {
    return pathExists(join(home, '.forge'));
  },

  configPath(ctx) {
    return ctx.overrides?.['forge'] ?? join(ctx.home, '.forge', '.forge.toml');
  },

  buildPlan(ctx) {
    const defaultModel = ctx.topModels?.[0]?.id ?? GATEWAY_DEFAULT_MODEL;
    const configPath = this.configPath(ctx);
    const base = ctx.baseUrlOverride ?? GATEWAY_CODING_AGENT_BASE_URL;
    return {
      fileChanges: [
        {
          path: configPath,
          label: 'ForgeCode config',
          format: 'toml',
          transform: current => {
            const config = current?.trim()
              ? (tomlParse(current) as AnyObject)
              : {};
            const providers = Array.isArray(config.providers)
              ? config.providers
              : [];
            config.providers = upsertById(providers, existing => ({
              ...existing,
              url: `${base}/chat/completions`,
              models: `${base}/models`,
              api_key_vars: GATEWAY_API_KEY_ENV,
              response_type: 'OpenAI',
              auth_methods: ['api_key'],
            }));
            config.session = {
              ...asObject(config.session),
              provider_id: PROVIDER_ID,
              model_id: defaultModel,
            };
            return `${tomlStringify(config)}\n`;
          },
        },
        {
          path: join(dirname(configPath), '.credentials.json'),
          label: 'ForgeCode credentials',
          format: 'json',
          mode: 0o600,
          transform: current => {
            const parsed: unknown = current?.trim() ? JSON.parse(current) : [];
            if (!Array.isArray(parsed)) {
              throw new Error('existing file is not a JSON array');
            }
            return JSON.stringify(
              upsertById(parsed, existing => ({
                ...existing,
                auth_details: {
                  ...asObject(existing.auth_details),
                  api_key: ctx.apiKey,
                },
              }))
            );
          },
        },
      ],
      envExports: [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }],
      notes: [
        `ForgeCode will use the gateway with ${defaultModel}; switch models in-session with :config-model (the picker fills from the gateway catalog).`,
        'Current ForgeCode reads the key from ~/.forge/.credentials.json (0600), not the environment, so the key is stored there.',
      ],
    };
  },
};
