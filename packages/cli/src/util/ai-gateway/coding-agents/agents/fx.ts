import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeJson, pathExists } from '../config-files';
import { GATEWAY_API_KEY_ENV } from '../gateway';

// fx talks to the gateway natively, so setup only settles the credential: the key is
// exported as AI_GATEWAY_API_KEY and credential_source pins fx to it, over `fx login`.
export const fx: CodingAgent = {
  id: 'fx',
  displayName: 'fx',

  async detect(home) {
    return pathExists(join(home, '.fx'));
  },

  configPath(ctx) {
    return ctx.overrides?.['fx'] ?? join(ctx.home, '.fx', 'settings.json');
  },

  buildPlan(ctx) {
    return {
      fileChanges: [
        {
          path: this.configPath(ctx),
          label: 'fx settings',
          format: 'json',
          transform: current =>
            mergeJson(current, { credential_source: 'ai_gateway_api_key' }),
        },
      ],
      envExports: [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }],
      notes: [
        `fx will authenticate with ${GATEWAY_API_KEY_ENV}; open a new terminal so it is loaded, then confirm with fx status.`,
        ...(ctx.tokenPass
          ? []
          : [
              'Pick a model with /model or browse the catalog with /models — the whole gateway catalog is available.',
            ]),
      ],
    };
  },
};
