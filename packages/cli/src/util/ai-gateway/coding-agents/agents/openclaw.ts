import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeJson, pathExists } from '../config-files';
import {
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
} from '../gateway';
import type { TopModel } from '../top-models';

/**
 * OpenClaw reads providers from `~/.openclaw/openclaw.json`. The apiKey field
 * takes an `${ENV_VAR}` reference OpenClaw resolves itself, and only models
 * declared in the provider's `models` array are routable, so a starter set is
 * included.
 */
const PROVIDER_KEY = 'vercel-ai-gateway';

const STARTER_MODELS = [
  { id: 'anthropic/claude-fable-5', name: 'Claude Fable 5' },
  { id: 'anthropic/claude-opus-4.8', name: 'Claude Opus 4.8' },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
  { id: 'openai/gpt-5.6-sol', name: 'GPT-5.6 Sol' },
  { id: 'google/gemini-3.6-flash', name: 'Gemini 3.6 Flash' },
];

type OpenClawModel = { id: string; name: string };

function entryFor(model: TopModel): OpenClawModel {
  return { id: model.id, name: `${model.name} (Gateway)` };
}

// mergeJson replaces arrays wholesale, and our docs tell users to add ids here, so keep theirs.
function existingModels(current: string | null): OpenClawModel[] {
  if (!current?.trim()) return [];
  try {
    const parsed = JSON.parse(current);
    const models = parsed?.models?.providers?.[PROVIDER_KEY]?.models;
    if (!Array.isArray(models)) return [];
    return models.filter(
      (m): m is OpenClawModel => typeof m?.id === 'string' && m.id.length > 0
    );
  } catch {
    return [];
  }
}

function mergeModels(
  ranked: OpenClawModel[],
  existing: OpenClawModel[]
): OpenClawModel[] {
  const merged: OpenClawModel[] = [];
  const seen = new Set<string>();
  for (const model of [...ranked, ...existing]) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    merged.push(model);
  }
  return merged;
}

export const openclaw: CodingAgent = {
  id: 'openclaw',
  displayName: 'OpenClaw',
  needsTopModels: true,

  async detect(home) {
    return pathExists(join(home, '.openclaw'));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['openclaw'] ??
      join(ctx.home, '.openclaw', 'openclaw.json')
    );
  },

  buildPlan(ctx) {
    const path = this.configPath(ctx);
    const baseUrl = ctx.baseUrlOverride ?? GATEWAY_CODING_AGENT_BASE_URL;
    const ranked = (ctx.topModels ?? STARTER_MODELS).map(entryFor);
    const primaryModel = ctx.topModels?.[0]?.id ?? GATEWAY_DEFAULT_MODEL;
    return {
      fileChanges: [
        {
          path,
          label: 'OpenClaw config',
          format: 'json',
          transform: current =>
            mergeJson(current, {
              models: {
                providers: {
                  [PROVIDER_KEY]: {
                    baseUrl,
                    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw's own env-reference syntax, resolved by OpenClaw at load time
                    apiKey: '${AI_GATEWAY_API_KEY}',
                    api: 'openai-completions',
                    models: mergeModels(ranked, existingModels(current)),
                  },
                },
              },
              agents: {
                defaults: {
                  model: {
                    primary: `${PROVIDER_KEY}/${primaryModel}`,
                  },
                },
              },
            }),
        },
      ],
      envExports: [{ name: 'AI_GATEWAY_API_KEY', value: ctx.apiKey }],
      notes: [
        `OpenClaw will default to ${PROVIDER_KEY}/${primaryModel}; the model list is in openclaw.json — add any gateway model id there.`,
        'Restart the OpenClaw gateway process so the new provider loads.',
      ],
    };
  },
};
