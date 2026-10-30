import { join } from 'node:path';
import type { CodingAgent } from '../types';
import type { Model } from '../../models';
import { mergeToml, pathExists } from '../config-files';
import {
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
} from '../gateway';
import { shortlistModels } from '../catalogue';

const PROVIDER_KEY = 'vercel-ai-gateway';

type TomlTable = Record<string, unknown>;

function profiles(models: Model[]): TomlTable {
  const out: TomlTable = {};
  for (const model of models) {
    out[model.id] = {
      name: model.name,
      ...(model.context_window
        ? { max_input_tokens: model.context_window }
        : {}),
      ...(model.max_tokens ? { max_output_tokens: model.max_tokens } : {}),
    };
  }
  return out;
}

// Deep Agents (dcode) reads ~/.deepagents/config.toml; api_key_env keeps the key in
// the shell. The models list feeds /model (not a routing gate); profile tables carry metadata.
export const deepagents: CodingAgent = {
  id: 'deepagents',
  displayName: 'Deep Agents CLI',
  needsModelCatalogue: true,
  needsTopModels: true,

  async detect(home) {
    return pathExists(join(home, '.deepagents'));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['deepagents'] ??
      join(ctx.home, '.deepagents', 'config.toml')
    );
  },

  buildPlan(ctx) {
    const baseUrl = ctx.baseUrlOverride ?? GATEWAY_CODING_AGENT_BASE_URL;
    const models = shortlistModels(ctx);
    const ids = models.length ? models.map(m => m.id) : [GATEWAY_DEFAULT_MODEL];
    return {
      fileChanges: [
        {
          path: this.configPath(ctx),
          label: 'Deep Agents config',
          format: 'toml',
          transform: current =>
            mergeToml(current, {
              models: {
                default: `${PROVIDER_KEY}:${ids[0]}`,
                providers: {
                  [PROVIDER_KEY]: {
                    display_name: 'Vercel AI Gateway',
                    api_key_env: 'AI_GATEWAY_API_KEY',
                    base_url: baseUrl,
                    class_path: 'langchain_openai:ChatOpenAI',
                    models: ids,
                    ...(models.length ? { profile: profiles(models) } : {}),
                    params: { use_responses_api: false },
                  },
                },
              },
            }),
        },
      ],
      envExports: [{ name: 'AI_GATEWAY_API_KEY', value: ctx.apiKey }],
      notes: [
        `Deep Agents (dcode) will default to ${PROVIDER_KEY}:${ids[0]}.`,
        ...(models.length
          ? [
              `The top ${models.length} gateway models are in the /model switcher, which filters as you type. Any other gateway id also works directly: /model ${PROVIDER_KEY}:<gateway-model-id>.`,
            ]
          : []),
        'Open a new terminal first so AI_GATEWAY_API_KEY is loaded.',
      ],
    };
  },
};
