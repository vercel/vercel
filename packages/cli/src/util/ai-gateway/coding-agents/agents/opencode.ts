import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeJson, pathExists } from '../config-files';

/**
 * OpenCode has a first-class native `vercel` provider (`@ai-sdk/gateway`). We
 * only supply the key via `provider.vercel.options.apiKey` — we deliberately do
 * NOT pin a default model; the user selects one (OpenCode model ids are
 * `vercel/<creator>/<model>` since the gateway's slugs already contain a slash).
 *
 * Config: `~/.config/opencode/opencode.json` (honors `$XDG_CONFIG_HOME`).
 * Docs: https://vercel.com/docs/ai-gateway/coding-agents/opencode
 */
function defaultConfigPath(home: string): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.startsWith('/') ? xdg : join(home, '.config');
  return join(base, 'opencode', 'opencode.json');
}

export const opencode: CodingAgent = {
  id: 'opencode',
  displayName: 'OpenCode',

  async detect(home) {
    return pathExists(defaultConfigPath(home));
  },

  configPath(ctx) {
    return ctx.overrides?.['opencode'] ?? defaultConfigPath(ctx.home);
  },

  buildPlan(ctx) {
    return {
      fileChanges: [
        {
          path: this.configPath(ctx),
          label: 'OpenCode config',
          format: 'json',
          transform: current =>
            mergeJson(current, {
              provider: {
                vercel: {
                  options: {
                    apiKey: ctx.apiKey,
                  },
                },
              },
            }),
        },
      ],
      envExports: [],
      notes: [
        'OpenCode can now use the Vercel AI Gateway; pick a model like vercel/<creator>/<model>.',
      ],
    };
  },
};
