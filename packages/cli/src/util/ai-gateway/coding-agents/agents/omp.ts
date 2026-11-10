import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { pathExists } from '../config-files';
import { GATEWAY_API_KEY_ENV } from '../gateway';

// omp (oh-my-pi) natively reads AI_GATEWAY_API_KEY and fills /model from the
// gateway catalog, so setup is the shell export only — never omp's SQLite store.
function ompDir(home: string): string {
  const dir = process.env.PI_CODING_AGENT_DIR;
  if (dir && dir.trim()) return dir;
  const name = process.env.PI_CONFIG_DIR;
  return join(home, name && name.trim() ? name.trim() : '.omp');
}

export const omp: CodingAgent = {
  id: 'omp',
  displayName: 'omp',

  async detect(home) {
    return pathExists(ompDir(home));
  },

  configPath(ctx) {
    return ctx.overrides?.['omp'] ?? ompDir(ctx.home);
  },

  buildPlan(ctx) {
    return {
      fileChanges: [],
      envExports: [{ name: GATEWAY_API_KEY_ENV, value: ctx.apiKey }],
      notes: [
        `omp's native Vercel AI Gateway provider reads ${GATEWAY_API_KEY_ENV} — pick a gateway model with /model or launch with --model vercel-ai-gateway/<model-id> (the picker lists the gateway catalog).`,
        `Open a new terminal so ${GATEWAY_API_KEY_ENV} is loaded, or run: export ${GATEWAY_API_KEY_ENV}=<key>`,
      ],
    };
  },
};
