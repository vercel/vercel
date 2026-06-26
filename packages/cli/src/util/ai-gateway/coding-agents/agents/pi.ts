import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeJson, pathExists } from '../config-files';

/**
 * Pi (the open-source terminal coding agent, `@earendil-works/pi-coding-agent`)
 * has a first-class `vercel-ai-gateway` provider — it already knows the gateway
 * base URL and model catalog. We only supply the credential in its auth file,
 * `~/.pi/agent/auth.json`, under the `vercel-ai-gateway` key. Pi creates that
 * file `0600`, so we do the same.
 *
 * Docs: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md
 */
export const pi: CodingAgent = {
  id: 'pi',
  displayName: 'Pi',

  async detect(home) {
    return pathExists(join(home, '.pi'));
  },

  buildPlan(ctx) {
    const path = join(ctx.home, '.pi', 'agent', 'auth.json');
    return {
      fileChanges: [
        {
          path,
          label: 'Pi auth',
          format: 'json',
          mode: 0o600,
          transform: current =>
            mergeJson(current, {
              'vercel-ai-gateway': { type: 'api_key', key: ctx.apiKey },
            }),
        },
      ],
      envExports: [],
      notes: [
        'Pi will use the Vercel AI Gateway provider; pick a model with /model or --model.',
      ],
    };
  },
};
