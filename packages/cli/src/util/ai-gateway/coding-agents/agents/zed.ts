import { isAbsolute, join } from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import type { CodingAgent } from '../types';
import { mergeJsonc, pathExists } from '../config-files';
import {
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
} from '../gateway';

// Zed's first-party vercel_ai_gateway provider reads VERCEL_AI_GATEWAY_API_KEY
// and auto-fetches the catalog from {api_url}/models; one model is declared
// (only when the user has declared none) so the Agent Panel default resolves
// before that first fetch. Zed's settings.json is JSONC, hence mergeJsonc.
const PROVIDER_ID = 'vercel_ai_gateway';
const ZED_KEY_ENV = 'VERCEL_AI_GATEWAY_API_KEY';

function zedConfigDir(home: string): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    const base =
      appData && isAbsolute(appData)
        ? appData
        : join(home, 'AppData', 'Roaming');
    return join(base, 'Zed');
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  const base =
    process.platform !== 'darwin' && xdg && isAbsolute(xdg)
      ? xdg
      : join(home, '.config');
  return join(base, 'zed');
}

export const zed: CodingAgent = {
  id: 'zed',
  needsModelCatalogue: true,
  needsTopModels: true,
  displayName: 'Zed',

  async detect(home) {
    return pathExists(zedConfigDir(home));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['zed'] ?? join(zedConfigDir(ctx.home), 'settings.json')
    );
  },

  buildPlan(ctx) {
    const apiUrl = ctx.baseUrlOverride ?? GATEWAY_CODING_AGENT_BASE_URL;
    // Pin the leaderboard leader only when the catalogue can size its starter entry.
    const top = (ctx.gatewayModels ?? []).find(
      m => m.id === ctx.topModels?.[0]?.id && m.context_window
    );
    const defaultModel = top?.id ?? GATEWAY_DEFAULT_MODEL;
    const starter = top
      ? {
          name: top.id,
          display_name: top.name,
          max_tokens: top.context_window,
          ...(top.max_tokens ? { max_output_tokens: top.max_tokens } : {}),
          capabilities: {
            tools: true,
            images: (top.tags ?? []).includes('vision'),
          },
        }
      : {
          name: GATEWAY_DEFAULT_MODEL,
          display_name: 'Claude Fable 5',
          max_tokens: 1000000,
          max_output_tokens: 128000,
          capabilities: { tools: true, images: true },
        };
    return {
      fileChanges: [
        {
          path: this.configPath(ctx),
          label: 'Zed settings',
          format: 'json',
          transform: current => {
            const hasModels = Boolean(
              parseJsonc(current ?? '')?.language_models?.[PROVIDER_ID]
                ?.available_models
            );
            return mergeJsonc(current, {
              language_models: {
                [PROVIDER_ID]: {
                  api_url: apiUrl,
                  ...(hasModels ? {} : { available_models: [starter] }),
                },
              },
              agent: {
                default_model: {
                  provider: PROVIDER_ID,
                  model: defaultModel,
                },
              },
            });
          },
        },
      ],
      envExports: [{ name: ZED_KEY_ENV, value: ctx.apiKey }],
      notes: [
        `Zed's built-in Vercel AI Gateway provider now targets the coding-agent endpoint with ${defaultModel} as the Agent Panel default; the full catalog loads from /models once the key is visible.`,
        `Launch Zed from a new terminal (or restart it) so ${ZED_KEY_ENV} is in its environment; Settings → AI → LLM Providers also accepts the key directly.`,
      ],
    };
  },
};
