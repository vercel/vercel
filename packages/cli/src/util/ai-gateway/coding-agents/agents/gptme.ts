import { isAbsolute, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml';
import type { CodingAgent } from '../types';
import { pathExists } from '../config-files';
import {
  GATEWAY_API_KEY_ENV,
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
  resolveGatewayBaseUrl,
} from '../gateway';

// gptme reads ~/.config/gptme/config.toml; [[providers]] tables are beyond
// mergeToml, so entries are upserted by name and re-serialized only on change.
// api_key_env keeps the key in the shell; [models].default selects the gateway.
const PROVIDER_NAME = 'vercel-ai-gateway';

type TomlTable = Record<string, unknown>;

function isTable(value: unknown): value is TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function gptmeConfigDir(home: string): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && isAbsolute(xdg) ? xdg : join(home, '.config');
  return join(base, 'gptme');
}

export const gptme: CodingAgent = {
  id: 'gptme',
  needsTopModels: true,
  displayName: 'gptme',

  async detect(home) {
    return pathExists(gptmeConfigDir(home));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['gptme'] ?? join(gptmeConfigDir(ctx.home), 'config.toml')
    );
  },

  buildPlan(ctx) {
    const defaultModel = ctx.topModels?.[0]?.id ?? GATEWAY_DEFAULT_MODEL;
    const path = this.configPath(ctx);
    const baseUrl = resolveGatewayBaseUrl(
      ctx.baseUrlOverride,
      GATEWAY_CODING_AGENT_BASE_URL
    );
    return {
      fileChanges: [
        {
          path,
          label: 'gptme config',
          format: 'toml',
          transform: current => {
            let doc: TomlTable = {};
            if (current && current.trim()) {
              try {
                doc = tomlParse(current) as TomlTable;
              } catch (err) {
                throw new Error(
                  `existing file is not valid TOML (${(err as Error).message})`
                );
              }
            }
            const providers = Array.isArray(doc.providers)
              ? [...doc.providers]
              : [];
            const entry: TomlTable = {
              name: PROVIDER_NAME,
              base_url: baseUrl,
              api_key_env: GATEWAY_API_KEY_ENV,
              default_model: defaultModel,
            };
            const index = providers.findIndex(
              value => isTable(value) && value.name === PROVIDER_NAME
            );
            if (index === -1) {
              providers.push(entry);
            } else {
              providers[index] = {
                ...(providers[index] as TomlTable),
                ...entry,
              };
            }
            const desired: TomlTable = {
              ...doc,
              providers,
              models: {
                ...(isTable(doc.models) ? doc.models : {}),
                default: `${PROVIDER_NAME}/${defaultModel}`,
              },
            };
            if (current && isDeepStrictEqual(doc, desired)) {
              return current;
            }
            return `${tomlStringify(desired)}\n`;
          },
        },
      ],
      envExports: [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }],
      notes: [
        `gptme will default to ${PROVIDER_NAME}/${defaultModel}; run other gateway models with -m ${PROVIDER_NAME}/<gateway-model-id>.`,
        `Open a new terminal first so ${GATEWAY_API_KEY_ENV} is loaded.`,
      ],
    };
  },
};
