import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml';
import type { CodingAgent, SetupContext } from '../types';
import type { Model } from '../../models';
import { pathExists } from '../config-files';
import {
  GATEWAY_API_KEY_ENV,
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
  resolveGatewayBaseUrl,
} from '../gateway';
import { shortlistModels } from '../catalogue';

const PROVIDER_KEY = 'vercel-ai-gateway';

type TomlTable = Record<string, unknown>;

function isTable(value: unknown): value is TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function vibeDir(home: string): string {
  const dir = process.env.VIBE_HOME;
  return dir && dir.trim() ? dir : join(home, '.vibe');
}

function shortlist(ctx: SetupContext): Model[] {
  return shortlistModels(ctx, { creator: 'mistral' });
}

function perMillionTokens(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value * 1e6 : undefined;
}

function modelEntry(model: Model): TomlTable {
  const input = perMillionTokens(model.pricing?.input);
  const output = perMillionTokens(model.pricing?.output);
  return {
    name: model.id,
    provider: PROVIDER_KEY,
    ...(model.context_window
      ? { auto_compact_threshold: model.context_window }
      : {}),
    ...(input === undefined ? {} : { input_price: input }),
    ...(output === undefined ? {} : { output_price: output }),
    supports_images: (model.tags ?? []).includes('vision'),
  };
}

// Mistral Vibe reads $VIBE_HOME/~/.vibe/config.toml; api_key_env_var keeps the key in
// the shell. [[models]] is an unaliased shortlist (Mistral's newest, then leaderboard
// leaders, gateway default guaranteed); active_model stays pinned to the default.
export const vibe: CodingAgent = {
  id: 'vibe',
  displayName: 'Mistral Vibe',
  needsModelCatalogue: true,
  needsTopModels: true,

  async detect(home) {
    return pathExists(vibeDir(home));
  },

  configPath(ctx) {
    return ctx.overrides?.['vibe'] ?? join(vibeDir(ctx.home), 'config.toml');
  },

  buildPlan(ctx) {
    const path = this.configPath(ctx);
    const baseUrl = resolveGatewayBaseUrl(
      ctx.baseUrlOverride,
      GATEWAY_CODING_AGENT_BASE_URL
    );
    const models = shortlist(ctx);
    const activeModel = models[0]?.id ?? GATEWAY_DEFAULT_MODEL;
    return {
      fileChanges: [
        {
          path,
          label: 'Mistral Vibe config',
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
            const providerEntry: TomlTable = {
              name: PROVIDER_KEY,
              api_base: baseUrl,
              api_key_env_var: GATEWAY_API_KEY_ENV,
              api_style: 'openai',
              backend: 'generic',
            };
            const at = providers.findIndex(
              v => isTable(v) && v.name === PROVIDER_KEY
            );
            if (at === -1) {
              providers.push(providerEntry);
            } else {
              providers[at] = {
                ...(providers[at] as TomlTable),
                ...providerEntry,
              };
            }
            const kept = (Array.isArray(doc.models) ? doc.models : []).filter(
              v => !(isTable(v) && v.provider === PROVIDER_KEY)
            );
            const ours = models.length
              ? models.map(modelEntry)
              : [{ name: GATEWAY_DEFAULT_MODEL, provider: PROVIDER_KEY }];
            const desired: TomlTable = {
              ...doc,
              providers,
              models: [...kept, ...ours],
              active_model: activeModel,
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
        `Mistral Vibe will default to ${activeModel} through the gateway; switch with /model.`,
        ...(models.length
          ? [
              `${models.length} shortlisted gateway models are in the /model picker; it scrolls but has no type-to-filter, and Vibe's own Mistral models are listed first. Re-run setup to refresh the list.`,
            ]
          : []),
        `Open a new terminal first so ${GATEWAY_API_KEY_ENV} is loaded.`,
      ],
    };
  },
};
