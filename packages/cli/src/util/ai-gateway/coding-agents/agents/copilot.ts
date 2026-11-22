import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { pathExists } from '../config-files';
import {
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
  resolveGatewayBaseUrl,
} from '../gateway';

// Copilot CLI's BYOK mode is pure env vars — no config file, no GitHub sign-in;
// COPILOT_PROVIDER_BASE_URL activates it. State dir: $COPILOT_HOME or ~/.copilot.
function copilotDir(home: string): string {
  const dir = process.env.COPILOT_HOME;
  return dir && dir.trim() ? dir : join(home, '.copilot');
}

export const copilot: CodingAgent = {
  id: 'copilot',
  needsTopModels: true,
  displayName: 'GitHub Copilot CLI',

  async detect(home) {
    return pathExists(copilotDir(home));
  },

  configPath(ctx) {
    return ctx.overrides?.['copilot'] ?? copilotDir(ctx.home);
  },

  buildPlan(ctx) {
    const defaultModel = ctx.topModels?.[0]?.id ?? GATEWAY_DEFAULT_MODEL;
    return {
      fileChanges: [],
      envExports: [
        {
          name: 'COPILOT_PROVIDER_BASE_URL',
          value: resolveGatewayBaseUrl(
            ctx.baseUrlOverride,
            GATEWAY_CODING_AGENT_BASE_URL
          ),
          plain: true,
        },
        { name: 'COPILOT_PROVIDER_API_KEY', value: ctx.apiKey },
        { name: 'COPILOT_MODEL', value: defaultModel, plain: true },
      ],
      notes: [
        `Copilot CLI will use the gateway with ${defaultModel}; set COPILOT_MODEL (or pass --model) to any gateway model id to switch.`,
        'Open a new terminal so the COPILOT_* variables are loaded; GitHub sign-in is not required in this mode.',
      ],
    };
  },
};
