import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeJson, pathExists } from '../config-files';

/**
 * OpenCode has a first-class native `vercel` provider (`@ai-sdk/gateway`). We
 * supply the key via `provider.vercel.options.apiKey` and set a default model.
 * OpenCode model ids are `provider/model`, and the gateway's own slugs already
 * contain a slash, so the full id is `vercel/<creator>/<model>`.
 *
 * Config: `~/.config/opencode/opencode.json` (honors `$XDG_CONFIG_HOME`).
 * Docs: https://vercel.com/docs/ai-gateway/coding-agents/opencode
 */
function configPath(home: string): string {
  // Per the XDG spec, only an absolute $XDG_CONFIG_HOME is honored; a relative
  // (or unset) value falls back to ~/.config.
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.startsWith('/') ? xdg : join(home, '.config');
  return join(base, 'opencode', 'opencode.json');
}

export const opencode: CodingAgent = {
  id: 'opencode',
  displayName: 'OpenCode',

  async detect(home) {
    return pathExists(configPath(home));
  },

  buildPlan(ctx) {
    const modelSlug = ctx.model;
    return {
      fileChanges: [
        {
          path: configPath(ctx.home),
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
              model: `vercel/${modelSlug}`,
            }),
        },
      ],
      envExports: [],
      notes: [`OpenCode will default to the model vercel/${modelSlug}.`],
    };
  },
};
