import { join } from 'node:path';
import type { CodingAgent } from '../types';
import type { Model } from '../../models';
import { mergeJson, pathExists } from '../config-files';
import {
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
} from '../gateway';

function persistenceDir(home: string): string {
  const dir = process.env.OPENHANDS_PERSISTENCE_DIR;
  return dir && dir.trim() ? dir : join(home, '.openhands');
}

function hasCondenserLlm(current: string | null): boolean {
  if (!current || !current.trim()) {
    return false;
  }
  try {
    const parsed = JSON.parse(current) as { condenser?: { llm?: unknown } };
    return Boolean(parsed?.condenser?.llm);
  } catch {
    return false;
  }
}

function costPerToken(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function modelPricing(
  models: Model[] | undefined,
  id: string
): Record<string, number> {
  const model = models?.find(m => m.id === id);
  const input = costPerToken(model?.pricing?.input);
  const output = costPerToken(model?.pricing?.output);
  return input === undefined || output === undefined
    ? {}
    : { input_cost_per_token: input, output_cost_per_token: output };
}

// OpenHands reads ~/.openhands/agent_settings.json (OPENHANDS_PERSISTENCE_DIR
// honored); a minimal llm block validates, the `openai/` LiteLLM prefix routes
// gateway ids, and an existing condenser LLM is repointed too. The per-config
// cost fields describe the pinned model only, so bad price parses are dropped.
export const openhands: CodingAgent = {
  id: 'openhands',
  displayName: 'OpenHands',
  needsModelCatalogue: true,
  needsTopModels: true,

  async detect(home) {
    return pathExists(persistenceDir(home));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['openhands'] ??
      join(persistenceDir(ctx.home), 'agent_settings.json')
    );
  },

  buildPlan(ctx) {
    const path = this.configPath(ctx);
    const baseUrl = ctx.baseUrlOverride ?? GATEWAY_CODING_AGENT_BASE_URL;
    const pinned = ctx.topModels?.[0]?.id ?? GATEWAY_DEFAULT_MODEL;
    const model = `openai/${pinned}`;
    return {
      fileChanges: [
        {
          path,
          label: 'OpenHands agent settings',
          format: 'json',
          mode: 0o600,
          transform: current => {
            const llm = {
              model,
              api_key: ctx.apiKey,
              base_url: baseUrl,
              ...modelPricing(ctx.gatewayModels, pinned),
            };
            return mergeJson(current, {
              llm: { ...llm, usage_id: 'agent' },
              ...(hasCondenserLlm(current) ? { condenser: { llm } } : {}),
            });
          },
        },
      ],
      envExports: [],
      notes: [
        `OpenHands will use the gateway with ${model}; switch models in /settings with openai/<gateway-model-id>.`,
        'Headless runs pick this up automatically — no --override-with-envs needed.',
      ],
    };
  },
};
