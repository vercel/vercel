import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeJson, pathExists } from '../config-files';
import {
  GATEWAY_API_KEY_ENV,
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
  resolveGatewayBaseUrl,
} from '../gateway';

/**
 * Command Code reads BYOK providers from `~/.commandcode/providers.json`.
 * Provider keys may reference environment variables with `$VAR`, so the
 * gateway key stays in the shell environment instead of the config file.
 * Command Code prefixes model IDs with the provider key in `/model`, and only
 * models declared in the provider's `models` object are selectable.
 *
 * Docs: https://commandcode.ai/docs/byok
 */
const PROVIDER_KEY = 'vercel';

export const commandCode: CodingAgent = {
  id: 'command-code',
  displayName: 'Command Code',
  honorsBaseUrl: true,

  async detect(home) {
    return pathExists(join(home, '.commandcode'));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['command-code'] ??
      join(ctx.home, '.commandcode', 'providers.json')
    );
  },

  buildPlan(ctx) {
    const path = this.configPath(ctx);
    const baseURL = resolveGatewayBaseUrl(
      ctx.baseUrlOverride,
      GATEWAY_CODING_AGENT_BASE_URL
    );
    return {
      fileChanges: [
        {
          path,
          label: 'Command Code providers',
          format: 'json',
          mode: 0o600,
          transform: current =>
            mergeJson(current, {
              provider: {
                [PROVIDER_KEY]: {
                  name: 'Vercel AI Gateway',
                  baseURL,
                  apiKey: `$${GATEWAY_API_KEY_ENV}`,
                  models: {
                    [GATEWAY_DEFAULT_MODEL]: {},
                  },
                },
              },
            }),
        },
      ],
      envExports: [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }],
      notes: [
        `Pick ${GATEWAY_DEFAULT_MODEL} under Vercel AI Gateway with /model.`,
        `Add other gateway model IDs under provider.${PROVIDER_KEY}.models in ~/.commandcode/providers.json.`,
        `Open a new terminal so ${GATEWAY_API_KEY_ENV} is loaded.`,
      ],
    };
  },
};
