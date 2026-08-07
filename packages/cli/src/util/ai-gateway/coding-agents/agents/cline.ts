import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeJson, pathExists } from '../config-files';
import { GATEWAY_DEFAULT_MODEL } from '../gateway';

/**
 * Cline's provider store is `~/.cline/data/settings/providers.json`, the same
 * 0600 file its own `cline auth` writes (the settings dir nests inside the
 * data dir). Cline ships a first-party vercel-ai-gateway provider, so no base
 * URL is involved and `--base-url` does not apply. `version` is only stamped
 * on new files so an existing store's schema version is never downgraded.
 */
export const cline: CodingAgent = {
  id: 'cline',
  displayName: 'Cline',
  experimental: true,

  async detect(home) {
    return pathExists(join(home, '.cline'));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['cline'] ??
      join(ctx.home, '.cline', 'data', 'settings', 'providers.json')
    );
  },

  buildPlan(ctx) {
    const path = this.configPath(ctx);
    return {
      fileChanges: [
        {
          path,
          label: 'Cline providers',
          format: 'json',
          mode: 0o600,
          transform: current => {
            const isNew = !current || !current.trim();
            return mergeJson(current, {
              ...(isNew ? { version: 1 } : {}),
              lastUsedProvider: 'vercel-ai-gateway',
              providers: {
                'vercel-ai-gateway': {
                  settings: {
                    provider: 'vercel-ai-gateway',
                    apiKey: ctx.apiKey,
                    model: GATEWAY_DEFAULT_MODEL,
                  },
                  updatedAt: new Date().toISOString(),
                  tokenSource: 'manual',
                },
              },
            });
          },
        },
      ],
      envExports: [],
      notes: [
        `Cline will use its native Vercel AI Gateway provider with ${GATEWAY_DEFAULT_MODEL}; switch models in-session or with \`cline auth -p vercel-ai-gateway -m <gateway-model-id>\`.`,
        'In the VS Code extension, pick the Vercel AI Gateway provider under Settings → API Provider.',
      ],
    };
  },
};
