import { dirname, join } from 'node:path';
import { dump, load } from 'js-yaml';
import type { CodingAgent, SetupContext } from '../types';
import { mergeJson, pathExists } from '../config-files';
import {
  GATEWAY_API_KEY_ENV,
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
} from '../gateway';
import { agenticModels, defaultFirst } from '../catalogue';

const PROVIDER_ID = 'vercel_ai_gateway';

function contextLimits(
  ctx: SetupContext
): { name: string; context_limit: number }[] {
  return defaultFirst(agenticModels(ctx, { requireContextWindow: true })).map(
    m => ({
      name: m.id,
      context_limit: m.context_window as number,
    })
  );
}

type YamlObject = Record<string, unknown>;

function asObject(value: unknown): YamlObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as YamlObject)
    : {};
}

function gooseConfigDir(home: string): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.startsWith('/') ? xdg : join(home, '.config');
  return join(base, 'goose');
}

// Goose reads ~/.config/goose/config.yaml plus provider JSONs in custom_providers/;
// ours shadows the built-in vercel_ai_gateway definition to repoint it, key resolved
// from AI_GATEWAY_API_KEY. The models array only supplies context sizes (discovery
// still comes from the API); never write `dynamic_models: false`, which would
// reduce Goose to exactly this array.
export const goose: CodingAgent = {
  id: 'goose',
  needsTopModels: true,
  displayName: 'Goose',
  needsModelCatalogue: true,

  async detect(home) {
    return pathExists(gooseConfigDir(home));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['goose'] ?? join(gooseConfigDir(ctx.home), 'config.yaml')
    );
  },

  buildPlan(ctx) {
    const defaultModel = ctx.topModels?.[0]?.id ?? GATEWAY_DEFAULT_MODEL;
    const configPath = this.configPath(ctx);
    const base = ctx.baseUrlOverride ?? GATEWAY_CODING_AGENT_BASE_URL;
    const models = contextLimits(ctx);
    return {
      fileChanges: [
        {
          path: configPath,
          label: 'Goose config',
          format: 'yaml',
          transform: current => {
            const config = asObject(load(current ?? '') ?? {});
            config.GOOSE_PROVIDER = PROVIDER_ID;
            config.GOOSE_MODEL = defaultModel;
            return dump(config, { lineWidth: 120 });
          },
        },
        {
          path: join(
            dirname(configPath),
            'custom_providers',
            `${PROVIDER_ID}.json`
          ),
          label: 'Goose provider',
          format: 'json',
          transform: current =>
            mergeJson(current, {
              name: PROVIDER_ID,
              engine: 'openai',
              display_name: 'Vercel AI Gateway',
              api_key_env: GATEWAY_API_KEY_ENV,
              base_url: `${base}/chat/completions`,
              ...(models.length ? { models } : {}),
            }),
        },
      ],
      envExports: [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }],
      notes: [
        `Goose will use the gateway with ${defaultModel}; switch models with GOOSE_MODEL in config.yaml or \`goose configure\` (the picker fills from the gateway catalog).`,
        ...(models.length
          ? [
              `Context limits for ${models.length} gateway models are recorded in custom_providers/${PROVIDER_ID}.json; without them Goose sizes most models at 128k. Re-run setup to refresh.`,
            ]
          : []),
        `Open a new terminal first so ${GATEWAY_API_KEY_ENV} is loaded.`,
      ],
    };
  },
};
