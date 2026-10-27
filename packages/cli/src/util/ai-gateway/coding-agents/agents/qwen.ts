import { join } from 'node:path';
import type { CodingAgent } from '../types';
import type { Model } from '../../models';
import { mergeJson, pathExists } from '../config-files';
import { GATEWAY_API_KEY_ENV, GATEWAY_CODING_AGENT_BASE_URL } from '../gateway';
import { shortlistModels } from '../catalogue';

const PREFERRED_MODEL = 'alibaba/qwen3-coder-plus';

type ProviderEntry = {
  id: string;
  name: string;
  baseUrl: string;
  envKey: string;
  generationConfig?: { contextWindowSize: number };
};

function defaultModelId(models: Model[]): string {
  return models[0]?.id ?? PREFERRED_MODEL;
}

function providerEntries(models: Model[], baseUrl: string): ProviderEntry[] {
  return models.map(m => ({
    id: m.id,
    name: m.name,
    baseUrl,
    envKey: GATEWAY_API_KEY_ENV,
    ...(m.context_window
      ? { generationConfig: { contextWindowSize: m.context_window } }
      : {}),
  }));
}

function isOurs(value: unknown, writtenIds: Set<string>): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as { envKey?: unknown; id?: unknown };
  if (entry.envKey === GATEWAY_API_KEY_ENV) return true;
  return typeof entry.id === 'string' && writtenIds.has(entry.id);
}

// Qwen Code reads ~/.qwen/settings.json; each entry's envKey keeps the key out of
// the file, and this array is the whole model universe (`model.name` resolves
// against it), written in shortlist picker order. Stale entries we wrote are replaced.
export const qwen: CodingAgent = {
  id: 'qwen',
  displayName: 'Qwen Code',
  needsModelCatalogue: true,
  needsTopModels: true,

  async detect(home) {
    return pathExists(join(home, '.qwen'));
  },

  configPath(ctx) {
    return ctx.overrides?.['qwen'] ?? join(ctx.home, '.qwen', 'settings.json');
  },

  buildPlan(ctx) {
    const baseUrl = ctx.baseUrlOverride ?? GATEWAY_CODING_AGENT_BASE_URL;
    const models = shortlistModels(ctx, { creator: 'alibaba' });
    const defaultId = defaultModelId(models);
    const entries = models.length
      ? providerEntries(models, baseUrl)
      : [
          {
            id: defaultId,
            name: defaultId,
            baseUrl,
            envKey: GATEWAY_API_KEY_ENV,
          },
        ];
    return {
      fileChanges: [
        {
          path: this.configPath(ctx),
          label: 'Qwen Code settings',
          format: 'json',
          transform: current => {
            const writtenIds = new Set(entries.map(e => e.id));
            let kept: unknown[] = [];
            try {
              const existing = JSON.parse(current ?? '').modelProviders?.openai;
              if (Array.isArray(existing)) {
                kept = existing.filter(e => !isOurs(e, writtenIds));
              }
            } catch {}
            return mergeJson(current, {
              modelProviders: { openai: [...kept, ...entries] },
              security: { auth: { selectedType: 'openai' } },
              model: { name: defaultId },
            });
          },
        },
      ],
      envExports: [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }],
      notes: [
        `Qwen Code will use the gateway with ${defaultId}.`,
        ...(models.length
          ? [
              `${models.length} shortlisted gateway models are configured — the newest Qwen models first, then the gateway's most-used. Re-run setup to refresh the list.`,
            ]
          : []),
        `Open a new terminal first so ${GATEWAY_API_KEY_ENV} is loaded.`,
      ],
    };
  },
};
