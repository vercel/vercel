import { dirname, join } from 'node:path';
import { dump, load } from 'js-yaml';
import type { CodingAgent, SetupContext } from '../types';
import { pathExists } from '../config-files';
import {
  GATEWAY_API_KEY_ENV,
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
} from '../gateway';
import { shortlistModels } from '../catalogue';

const FALLBACK_MODELS = [GATEWAY_DEFAULT_MODEL];

function chatModelIds(ctx: SetupContext): string[] {
  const ids = shortlistModels(ctx).map(m => m.id);
  return ids.length ? ids : FALLBACK_MODELS;
}

const ONBOARDING_MARKER = '.onboarding_complete';

// biome-ignore lint/suspicious/noTemplateCurlyInString: Continue's literal secret-reference syntax
const SECRET_REF = '${{ secrets.AI_GATEWAY_API_KEY }}';

type YamlObject = Record<string, unknown>;

function asObject(value: unknown): YamlObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as YamlObject)
    : {};
}

// cn launches with the first models entry in ~/.continue/config.yaml, so the shortlist
// leads with the gateway default; the marker stops interactive-cn onboarding rewrites.
export const continueCli: CodingAgent = {
  id: 'continue',
  displayName: 'Continue CLI',
  needsModelCatalogue: true,
  needsTopModels: true,

  async detect(home) {
    return pathExists(join(home, '.continue'));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['continue'] ?? join(ctx.home, '.continue', 'config.yaml')
    );
  },

  buildPlan(ctx) {
    const apiBase = ctx.baseUrlOverride ?? GATEWAY_CODING_AGENT_BASE_URL;
    const configPath = this.configPath(ctx);
    const modelIds = chatModelIds(ctx);
    return {
      fileChanges: [
        {
          path: configPath,
          label: 'Continue config',
          format: 'yaml',
          transform: current => {
            const config = asObject(load(current ?? '') ?? {});
            if (typeof config.name !== 'string') config.name = 'Local Config';
            if (typeof config.version !== 'string') config.version = '1.0.0';
            if (typeof config.schema !== 'string') config.schema = 'v1';
            const models = Array.isArray(config.models)
              ? [...config.models]
              : [];
            const writtenIds = new Set<unknown>(modelIds);
            // Entries we wrote before (secret-ref key, or an id we're rewriting)
            // are replaced by the shortlist; user-owned entries survive.
            const kept = models.filter(entry => {
              const e = asObject(entry);
              return !(e.apiKey === SECRET_REF || writtenIds.has(e.name));
            });
            const entries = modelIds.map(id => ({
              ...asObject(models.find(m => asObject(m).name === id)),
              name: id,
              provider: 'openai',
              model: id,
              apiBase,
              apiKey: SECRET_REF,
            }));
            config.models = [...kept, ...entries];
            return dump(config, { lineWidth: 120 });
          },
        },
        {
          path: join(dirname(configPath), ONBOARDING_MARKER),
          label: 'Continue onboarding marker',
          format: 'text',
          transform: current => current ?? `${new Date().toISOString()}\n`,
        },
      ],
      envExports: [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }],
      notes: [
        modelIds.length > 1
          ? `Continue CLI will use the gateway with ${modelIds[0]}; /model lists the top ${modelIds.length} gateway models -- re-run setup to refresh the list.`
          : `Continue CLI will use the gateway with ${GATEWAY_DEFAULT_MODEL}; the gateway catalogue could not be fetched, so /model lists only that model until setup is re-run.`,
        `Open a new terminal first so ${GATEWAY_API_KEY_ENV} is loaded, then run \`cn\`.`,
        `If \`cn\` ever asks for an Anthropic API key, ${ONBOARDING_MARKER} is missing next to the config -- re-run setup rather than answering the prompt, which would overwrite the gateway models.`,
      ],
    };
  },
};
