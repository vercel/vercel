import { join } from 'node:path';
import type { CodingAgent, SetupContext } from '../types';
import { mergeJson, pathExists } from '../config-files';
import {
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
} from '../gateway';
import { shortlistModels } from '../catalogue';

// biome-ignore lint/suspicious/noTemplateCurlyInString: Droid's own env-reference syntax, resolved by Droid at load time
const API_KEY_REF = '${AI_GATEWAY_API_KEY}';
const PROVIDER = 'generic-chat-completion-api';
const FALLBACK_MAX_OUTPUT_TOKENS = 64000;

type CustomModel = {
  model: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  provider: string;
  maxOutputTokens: number;
};

function gatewayEntries(ctx: SetupContext, baseUrl: string): CustomModel[] {
  const models = shortlistModels(ctx, { requireMaxTokens: true });
  if (!models.length) {
    return [entry(GATEWAY_DEFAULT_MODEL, baseUrl, FALLBACK_MAX_OUTPUT_TOKENS)];
  }
  return models.map(m => entry(m.id, baseUrl, m.max_tokens as number));
}

function entry(
  model: string,
  baseUrl: string,
  maxOutputTokens: number
): CustomModel {
  return {
    model,
    displayName: model,
    baseUrl,
    apiKey: API_KEY_REF,
    provider: PROVIDER,
    maxOutputTokens,
  };
}

function isOurs(value: unknown): boolean {
  return (value as { apiKey?: unknown } | null)?.apiKey === API_KEY_REF;
}

function mergeCustomModels(
  current: string | null,
  entries: CustomModel[]
): string {
  let existing: unknown;
  try {
    existing = current?.trim() ? JSON.parse(current) : {};
  } catch (err) {
    throw new Error(
      `existing file is not valid JSON (${(err as Error).message})`
    );
  }
  const currentModels = (existing as { customModels?: unknown }).customModels;
  const kept: unknown[] = Array.isArray(currentModels)
    ? currentModels.filter(m => !isOurs(m))
    : [];
  return mergeJson(current, { customModels: [...kept, ...entries] });
}

// Droid does no discovery: customModels in ~/.factory/settings.json is the /model
// picker — a leaderboard shortlist, default first; ownership keys on the env reference.
export const droid: CodingAgent = {
  id: 'droid',
  displayName: 'Factory Droid',
  needsModelCatalogue: true,
  needsTopModels: true,

  async detect(home) {
    return pathExists(join(home, '.factory'));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['droid'] ?? join(ctx.home, '.factory', 'settings.json')
    );
  },

  buildPlan(ctx) {
    const baseUrl = ctx.baseUrlOverride ?? GATEWAY_CODING_AGENT_BASE_URL;
    const entries = gatewayEntries(ctx, baseUrl);
    return {
      fileChanges: [
        {
          path: this.configPath(ctx),
          label: 'Factory Droid settings',
          format: 'json',
          transform: current => mergeCustomModels(current, entries),
        },
      ],
      envExports: [{ name: 'AI_GATEWAY_API_KEY', value: ctx.apiKey }],
      notes: [
        entries.length > 1
          ? `The top ${entries.length} gateway models are in Droid's /model picker, leaderboard order -- re-run setup to refresh the list.`
          : `Factory Droid gets ${GATEWAY_DEFAULT_MODEL}; pick it with /model in a session or \`droid exec -m ${GATEWAY_DEFAULT_MODEL}\`.`,
        `\`droid exec\` defaults to a Factory-hosted model this key cannot use -- always pass \`-m ${entries[0]?.model ?? GATEWAY_DEFAULT_MODEL}\` (or another gateway model above).`,
      ],
    };
  },
};
