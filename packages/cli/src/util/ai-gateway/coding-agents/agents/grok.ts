import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeToml, pathExists } from '../config-files';
import {
  GATEWAY_API_KEY_ENV,
  GATEWAY_CODING_AGENT_BASE_URL,
  resolveGatewayBaseUrl,
} from '../gateway';

// Grok Build (xAI's `grok` CLI) reads `$GROK_HOME`/`~/.grok/config.toml`; the
// default model entry names AI_GATEWAY_API_KEY via env_key, keeping the key in the shell.
const MODEL_KEY = 'vercel-ai-gateway';
const DEFAULT_MODEL = 'xai/grok-4.6';
const GROK_KEY_ENV = 'GROK_CODE_XAI_API_KEY';

function grokDir(home: string): string {
  const dir = process.env.GROK_HOME;
  return dir && dir.trim() ? dir : join(home, '.grok');
}

export const grok: CodingAgent = {
  id: 'grok',
  displayName: 'Grok Build',

  async detect(home) {
    return pathExists(grokDir(home));
  },

  configPath(ctx) {
    return ctx.overrides?.['grok'] ?? join(grokDir(ctx.home), 'config.toml');
  },

  buildPlan(ctx) {
    const path = this.configPath(ctx);
    const baseUrl = resolveGatewayBaseUrl(
      ctx.baseUrlOverride,
      GATEWAY_CODING_AGENT_BASE_URL
    );
    return {
      fileChanges: [
        {
          path,
          label: 'Grok Build config',
          format: 'toml',
          transform: current =>
            mergeToml(current, {
              endpoints: { models_base_url: baseUrl },
              models: { default: MODEL_KEY },
              model: {
                [MODEL_KEY]: {
                  model: DEFAULT_MODEL,
                  base_url: baseUrl,
                  name: 'Grok 4.6 (Vercel AI Gateway)',
                  env_key: GATEWAY_API_KEY_ENV,
                  context_window: 500000,
                },
              },
            }),
        },
      ],
      envExports: [
        { name: GATEWAY_API_KEY_ENV, value: ctx.apiKey },
        { name: GROK_KEY_ENV, value: ctx.apiKey },
      ],
      notes: [
        `Grok Build will default to ${DEFAULT_MODEL} through the gateway; Ctrl+M (or /model) lists the full catalog — open a new terminal first so ${GROK_KEY_ENV} is loaded for those models.`,
        'If you previously ran `grok login`, run `grok logout` so the stored xAI session does not shadow the gateway key.',
      ],
    };
  },
};
