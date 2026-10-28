import { join } from 'node:path';
import { dump, load } from 'js-yaml';
import type { CodingAgent } from '../types';
import { pathExists } from '../config-files';
import { GATEWAY_API_KEY_ENV } from '../gateway';
import { shortlistModels } from '../catalogue';

const PROVIDER_KEY = 'vercel-ai-gateway';
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

type YamlObject = Record<string, unknown>;

function asObject(value: unknown): YamlObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as YamlObject)
    : {};
}

function dshDir(home: string): string {
  const dir = process.env.DSH_HOME;
  return dir && dir.trim() ? dir : join(home, '.dsh');
}

// DeepSeek Harness (dsh) reads `$DSH_HOME/settings.yaml`; its pi-ai LLM layer's
// vercel-ai-gateway provider owns the endpoint, and a declared `models` list
// replaces pi-ai's catalogue — so the shortlist we write IS the picker.
export const deepseek: CodingAgent = {
  id: 'deepseek',
  displayName: 'DeepSeek Harness',
  needsModelCatalogue: true,
  needsTopModels: true,

  async detect(home) {
    return pathExists(dshDir(home));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['deepseek'] ?? join(dshDir(ctx.home), 'settings.yaml')
    );
  },

  buildPlan(ctx) {
    const path = this.configPath(ctx);
    const models = shortlistModels(ctx, { creator: 'deepseek' }).map(m => ({
      id: m.id,
      name: m.name,
    }));
    const defaultId = models[0]?.id ?? DEFAULT_MODEL;
    return {
      fileChanges: [
        {
          path,
          label: 'DeepSeek Harness settings',
          format: 'yaml',
          transform: current => {
            const config = asObject(load(current ?? '') ?? {});
            const llm = asObject(config['llm-pi-ai']);
            const providers = asObject(llm.providers);
            const entry = asObject(providers[PROVIDER_KEY]);
            delete entry.api;
            delete entry.baseURL;
            delete entry.models;
            providers[PROVIDER_KEY] = {
              ...entry,
              apiKeyEnv: GATEWAY_API_KEY_ENV,
              ...(models.length ? { models } : {}),
            };
            llm.providers = providers;
            config['llm-pi-ai'] = llm;
            config['agent-default-model'] = {
              provider: PROVIDER_KEY,
              model: defaultId,
            };
            return dump(config, { lineWidth: 120 });
          },
        },
      ],
      envExports: [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }],
      notes: [
        models.length
          ? `DeepSeek Harness will default to ${PROVIDER_KEY}/${defaultId}; the shortlist in settings.yaml is the picker — add any gateway model id there.`
          : `DeepSeek Harness will default to ${PROVIDER_KEY}/${DEFAULT_MODEL}; every gateway model pi-ai ships is selectable with /model — no per-model config needed.`,
        `Open a new terminal so ${GATEWAY_API_KEY_ENV} is loaded, then run \`dsh\` — headless runs use the gateway route too.`,
      ],
    };
  },
};
