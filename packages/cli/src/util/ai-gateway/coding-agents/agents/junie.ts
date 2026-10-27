import { isAbsolute, join } from 'node:path';
import type { CodingAgent, FileChange } from '../types';
import { mergeJson, pathExists } from '../config-files';
import {
  GATEWAY_API_KEY_ENV,
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
} from '../gateway';
import { shortlistModels } from '../catalogue';

const PROFILE_NAME = 'vercel-ai-gateway';
const MODEL_PROFILE_PREFIX = 'vercel-';
const PROVIDER_LABEL = 'Vercel AI Gateway';

function junieHome(home: string): string {
  const env = process.env.JUNIE_HOME;
  return env && isAbsolute(env) ? env : join(home, '.junie');
}

function profileId(modelId: string): string {
  return `${MODEL_PROFILE_PREFIX}${modelId.replace(/[^a-zA-Z0-9._-]+/g, '-')}`;
}

// Junie CLI loads model profiles from $JUNIE_HOME/models/*.json (default ~/.junie);
// the filename is the profile id and env references resolve at load time.
export const junie: CodingAgent = {
  id: 'junie',
  displayName: 'Junie CLI',
  needsModelCatalogue: true,
  needsTopModels: true,

  async detect(home) {
    return pathExists(junieHome(home));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['junie'] ??
      join(junieHome(ctx.home), 'models', `${PROFILE_NAME}.json`)
    );
  },

  buildPlan(ctx) {
    const base = ctx.baseUrlOverride ?? GATEWAY_CODING_AGENT_BASE_URL;
    const baseUrl = `${base.replace(/\/+$/, '')}/chat/completions`;
    const configPath = this.configPath(ctx);
    const models = shortlistModels(ctx);
    const stableId = ctx.topModels?.[0]?.id ?? GATEWAY_DEFAULT_MODEL;
    const stableModel = models.find(m => m.id === stableId);

    const changes: FileChange[] = [
      {
        path: configPath,
        label: 'Junie model profile',
        format: 'json',
        transform: current => {
          const isNew = !current || !current.trim();
          return mergeJson(current, {
            ...(isNew
              ? {
                  id: stableId,
                  providerName: PROVIDER_LABEL,
                  ...(stableModel
                    ? {
                        displayName: stableModel.name,
                        ...(stableModel.context_window
                          ? { maxContextLength: stableModel.context_window }
                          : {}),
                      }
                    : {}),
                }
              : {}),
            baseUrl,
            apiType: 'OpenAICompletion',
            // biome-ignore lint/suspicious/noTemplateCurlyInString: Junie's own env-reference syntax, resolved by Junie when the profile loads
            apiKey: '${AI_GATEWAY_API_KEY}',
          });
        },
      },
    ];

    for (const model of models) {
      changes.push({
        path: join(configPath, '..', `${profileId(model.id)}.json`),
        label: `Junie model profile (${model.id})`,
        format: 'json',
        transform: current =>
          mergeJson(current, {
            id: model.id,
            displayName: model.name,
            providerName: PROVIDER_LABEL,
            baseUrl,
            apiType: 'OpenAICompletion',
            // biome-ignore lint/suspicious/noTemplateCurlyInString: Junie's own env-reference syntax, resolved by Junie when the profile loads
            apiKey: '${AI_GATEWAY_API_KEY}',
            ...(model.context_window
              ? { maxContextLength: model.context_window }
              : {}),
          }),
      });
    }

    return {
      fileChanges: changes,
      envExports: [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }],
      notes: [
        `Run \`junie --model custom:${PROFILE_NAME}\` or pick the model with /model in a session; the profile defaults to ${stableId} — change its \`id\` to any gateway model.`,
        ...(models.length
          ? [
              `The top ${models.length} gateway models are also written as their own \`custom:${MODEL_PROFILE_PREFIX}<model-id>\` profiles, grouped under ${PROVIDER_LABEL} in /model after the built-in providers — re-run setup to refresh the shortlist; profiles from earlier runs stay in place. Junie prices custom profiles at 0; it has no config hook for real rates.`,
            ]
          : []),
        `Open a new terminal so ${GATEWAY_API_KEY_ENV} is loaded — Junie resolves it when the profile loads and errors if it is unset.`,
      ],
    };
  },
};
