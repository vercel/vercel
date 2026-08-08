import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeJson, pathExists } from '../config-files';
import { GATEWAY_DEFAULT_MODEL, GATEWAY_OPENAI_BASE_URL } from '../gateway';

/**
 * OpenClaw reads providers from `~/.openclaw/openclaw.json`. The apiKey field
 * takes an `${ENV_VAR}` reference OpenClaw resolves itself, and only models
 * declared in the provider's `models` array are routable, so a starter set is
 * included.
 */
const PROVIDER_KEY = 'vercel-ai-gateway';
const STARTER_MODELS = [
  { id: 'anthropic/claude-fable-5', name: 'Claude Fable 5 (Gateway)' },
  { id: 'anthropic/claude-opus-4.8', name: 'Claude Opus 4.8 (Gateway)' },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6 (Gateway)' },
  { id: 'openai/gpt-5.6-sol', name: 'GPT-5.6 Sol (Gateway)' },
  { id: 'google/gemini-3.6-flash', name: 'Gemini 3.6 Flash (Gateway)' },
];

export const openclaw: CodingAgent = {
  id: 'openclaw',
  displayName: 'OpenClaw',
  experimental: true,

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
    const baseUrl = ctx.baseUrlOverride ?? GATEWAY_OPENAI_BASE_URL;
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
                    models: STARTER_MODELS,
                  },
                },
              },
              agents: {
                defaults: {
                  model: {
                    primary: `${PROVIDER_KEY}/${GATEWAY_DEFAULT_MODEL}`,
                  },
                },
              },
            }),
        },
      ],
      envExports: [{ name: 'AI_GATEWAY_API_KEY', value: ctx.apiKey }],
      notes: [
        `OpenClaw will default to ${PROVIDER_KEY}/${GATEWAY_DEFAULT_MODEL}; the starter model list is in openclaw.json — add any gateway model id there.`,
        'Restart the OpenClaw gateway process so the new provider loads.',
      ],
    };
  },
};
