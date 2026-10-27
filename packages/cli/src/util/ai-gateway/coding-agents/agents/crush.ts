import { isAbsolute, join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeJson, pathExists } from '../config-files';
import { GATEWAY_API_KEY_ENV, GATEWAY_DEFAULT_MODEL } from '../gateway';

const SMALL_MODEL = 'anthropic/claude-haiku-4.5';

function crushConfigDir(home: string): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && isAbsolute(xdg) ? xdg : join(home, '.config');
  return join(base, 'crush');
}

// Crush's native `vercel` provider resolves `$AI_GATEWAY_API_KEY` itself — the key
// stays out of the file — and the large/small model roles are pinned to gateway models.
export const crush: CodingAgent = {
  id: 'crush',
  needsTopModels: true,
  displayName: 'Crush',

  async detect(home) {
    return (
      (await pathExists(crushConfigDir(home))) ||
      pathExists(join(home, '.local', 'share', 'crush'))
    );
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['crush'] ?? join(crushConfigDir(ctx.home), 'crush.json')
    );
  },

  buildPlan(ctx) {
    const defaultModel = ctx.topModels?.[0]?.id ?? GATEWAY_DEFAULT_MODEL;
    const base = ctx.baseUrlOverride?.trim();
    return {
      fileChanges: [
        {
          path: this.configPath(ctx),
          label: 'Crush config',
          format: 'json',
          transform: current =>
            mergeJson(current, {
              providers: {
                vercel: {
                  api_key: `$${GATEWAY_API_KEY_ENV}`,
                  ...(base ? { base_url: base } : {}),
                },
              },
              models: {
                large: { provider: 'vercel', model: defaultModel },
                small: { provider: 'vercel', model: SMALL_MODEL },
              },
            }),
        },
      ],
      envExports: [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }],
      notes: [
        `Crush will use its native Vercel AI Gateway provider with ${defaultModel} (${SMALL_MODEL} for small tasks); switch models in-session with ctrl+p.`,
        `Open a new terminal first so ${GATEWAY_API_KEY_ENV} is loaded.`,
      ],
    };
  },
};
