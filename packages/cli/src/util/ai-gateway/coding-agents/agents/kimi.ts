import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml';
import type { CodingAgent, SetupContext } from '../types';
import type { Model } from '../../models';
import { pathExists } from '../config-files';
import {
  GATEWAY_CODING_AGENT_BASE_URL,
  resolveGatewayBaseUrl,
} from '../gateway';
import { shortlistModels } from '../catalogue';

const PROVIDER_KEY = 'vercel-ai-gateway';
const PREFERRED_MODEL = 'moonshotai/kimi-k3';

type TomlTable = Record<string, unknown>;

function isTable(value: unknown): value is TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function kimiDir(home: string): string {
  const dir = process.env.KIMI_SHARE_DIR;
  return dir && dir.trim() ? dir : join(home, '.kimi');
}

function shortlist(ctx: SetupContext): Model[] {
  return shortlistModels(ctx, {
    creator: 'moonshotai',
    requireContextWindow: true,
  });
}

function defaultModelKey(models: Model[]): string {
  return models[0]?.id ?? PREFERRED_MODEL;
}

// Kimi CLI reads $KIMI_SHARE_DIR/config.toml (default ~/.kimi); providers need a
// literal api_key, so new files are created 0600. [models] is a sized shortlist
// (Moonshot's newest, then leaderboard leaders); default_model must name a declared key.
export const kimi: CodingAgent = {
  id: 'kimi',
  displayName: 'Kimi CLI',
  needsModelCatalogue: true,
  needsTopModels: true,

  async detect(home) {
    return pathExists(kimiDir(home));
  },

  configPath(ctx) {
    return ctx.overrides?.['kimi'] ?? join(kimiDir(ctx.home), 'config.toml');
  },

  buildPlan(ctx) {
    const path = this.configPath(ctx);
    const baseUrl = resolveGatewayBaseUrl(
      ctx.baseUrlOverride,
      GATEWAY_CODING_AGENT_BASE_URL
    );
    const models = shortlist(ctx);
    const defaultKey = defaultModelKey(models);
    return {
      fileChanges: [
        {
          path,
          label: 'Kimi CLI config',
          format: 'toml',
          mode: 0o600,
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
            const providers = isTable(doc.providers) ? doc.providers : {};
            const keptModels = Object.fromEntries(
              Object.entries(isTable(doc.models) ? doc.models : {}).filter(
                ([, value]) =>
                  !(isTable(value) && value.provider === PROVIDER_KEY)
              )
            );
            const ours: TomlTable = {};
            for (const model of models) {
              ours[model.id] = {
                provider: PROVIDER_KEY,
                model: model.id,
                max_context_size: model.context_window,
                display_name: model.name,
              };
            }
            if (!models.length) {
              ours[defaultKey] = {
                provider: PROVIDER_KEY,
                model: defaultKey,
                max_context_size: 128_000,
              };
            }
            const desired: TomlTable = {
              ...doc,
              default_model: defaultKey,
              providers: {
                ...providers,
                [PROVIDER_KEY]: {
                  ...(isTable(providers[PROVIDER_KEY])
                    ? (providers[PROVIDER_KEY] as TomlTable)
                    : {}),
                  type: 'openai_legacy',
                  base_url: baseUrl,
                  api_key: ctx.apiKey,
                },
              },
              models: { ...keptModels, ...ours },
            };
            if (current && isDeepStrictEqual(doc, desired)) {
              return current;
            }
            return `${tomlStringify(desired)}\n`;
          },
        },
      ],
      envExports: [],
      notes: [
        `Kimi CLI will use the gateway with ${defaultKey}; switch with /model.`,
        ...(models.length
          ? [
              `A shortlist of ${models.length} gateway models is declared in config.toml; re-run setup to refresh it.`,
            ]
          : []),
        'Kimi CLI lets OPENAI_API_KEY/OPENAI_BASE_URL env vars override this provider — unset them if requests fail with auth errors.',
      ],
    };
  },
};
