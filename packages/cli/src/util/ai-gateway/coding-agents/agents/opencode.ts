import { isAbsolute, join } from 'node:path';
import type { CodingAgent, EnvExport } from '../types';
import { mergeJson, pathExists } from '../config-files';
import { GATEWAY_API_KEY_ENV } from '../gateway';

/**
 * OpenCode has a first-class native `vercel` provider (`@ai-sdk/gateway`), which
 * reads the key from `provider.vercel.options.apiKey` or, like Codex, the
 * `AI_GATEWAY_API_KEY` env var. We deliberately do NOT pin a default model; the
 * user selects one (OpenCode model ids are `vercel/<creator>/<model>` since the
 * gateway's slugs already contain a slash).
 *
 * With Keychain enabled we keep the key out of the config: we declare the
 * `vercel` provider but leave the credential to `AI_GATEWAY_API_KEY`, exported
 * from the shell rc (Keychain-resolved at runtime), so the secret never lands
 * in `opencode.json`.
 *
 * Config: `~/.config/opencode/opencode.json` (honors `$XDG_CONFIG_HOME`).
 * Docs: https://vercel.com/docs/ai-gateway/coding-agents/opencode
 */
function defaultConfigPath(home: string): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && isAbsolute(xdg) ? xdg : join(home, '.config');
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
    const vercel = ctx.useKeychain ? {} : { options: { apiKey: ctx.apiKey } };
    const envExports: EnvExport[] = ctx.useKeychain
      ? [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }]
      : [];
    const notes = [
      'OpenCode can now use the Vercel AI Gateway; pick a model like vercel/<creator>/<model>.',
    ];
    if (ctx.useKeychain) {
      notes.push(
        `Open a new terminal so ${GATEWAY_API_KEY_ENV} is loaded (Keychain-backed).`
      );
    }
    return {
      fileChanges: [
        {
          path: this.configPath(ctx),
          label: 'OpenCode config',
          format: 'json',
          transform: current => mergeJson(current, { provider: { vercel } }),
        },
      ],
      envExports,
      notes,
    };
  },
};
