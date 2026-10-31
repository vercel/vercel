import { join } from 'node:path';
import type { CodingAgent, SetupContext } from '../types';
import {
  mergeJson,
  parseJsonObjectOrNull,
  pathExists,
  type JsonObject,
} from '../config-files';
import {
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
  resolveGatewayBaseUrl,
} from '../gateway';
import { shortlistModels } from '../catalogue';

// ZCode (Z.ai's desktop ADE) has no env-var indirection for custom providers,
// so the key is written into its config file (0600). The running app rewrites
// that file from memory on settings flushes, hence the quit-first warning.

export const ZCODE_PROVIDER_KEY = 'c7c0f1e6-4aa2-4b7e-8f5e-2f1d9f3f7a42';

export const ZCODE_PROVIDER_NAME = 'Vercel AI Gateway';

// Must stay an enum the GUI writes: one unknown `kind` makes ZCode silently
// drop EVERY custom provider at load and rewrite the file without them.
const ZCODE_KIND_OPENAI_COMPATIBLE = 'openai-compatible';

const VERIFIED_MODELS: Record<string, unknown> = {
  [GATEWAY_DEFAULT_MODEL]: {
    limit: { context: 1_000_000, output: 128_000 },
    modalities: { input: ['text', 'image'], output: ['text'] },
    zcode: { modalitiesConfigured: true },
  },
  'openai/gpt-5.6-sol': {
    limit: { context: 1_050_000, output: 128_000 },
    modalities: { input: ['text', 'image'], output: ['text'] },
    zcode: { modalitiesConfigured: true },
  },
};

function seedModels(ctx: SetupContext): Record<string, unknown> {
  const ranked = shortlistModels(ctx, {
    requireContextWindow: true,
    requireMaxTokens: true,
    ensureDefault: true,
  });
  if (!ranked.length) {
    return VERIFIED_MODELS;
  }
  const models: Record<string, unknown> = {};
  for (const m of ranked) {
    models[m.id] = VERIFIED_MODELS[m.id] ?? {
      limit: { context: m.context_window, output: m.max_tokens },
    };
  }
  return models;
}

interface ZcodeProviderEntry {
  kind?: unknown;
  options?: { baseURL?: unknown };
}

// Reuse only a user entry whose baseURL matches the target exactly: neither a
// sibling-endpoint provider nor a working production entry may be rewritten.
function findExistingGatewayKey(
  config: JsonObject | null,
  targetBaseURL: string
): string | null {
  const providers = (
    config as { provider?: Record<string, ZcodeProviderEntry> } | null
  )?.provider;
  if (!providers) return null;
  for (const [key, entry] of Object.entries(providers)) {
    const baseURL = entry?.options?.baseURL;
    if (
      entry?.kind === ZCODE_KIND_OPENAI_COMPATIBLE &&
      baseURL === targetBaseURL
    ) {
      return key;
    }
  }
  return null;
}

export const zcode: CodingAgent = {
  id: 'zcode',
  displayName: 'ZCode',
  honorsBaseUrl: true,
  needsTopModels: true,
  needsModelCatalogue: true,

  async detect(home) {
    return pathExists(join(home, '.zcode'));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.['zcode'] ?? join(ctx.home, '.zcode', 'v2', 'config.json')
    );
  },

  async warnings() {
    return [
      {
        code: 'zcode-quit-before-setup',
        impact: 'Quit the ZCode desktop app before continuing.',
        why: [
          'ZCode keeps its provider registry in memory and rewrites its config file when it saves settings or exits, silently discarding edits made while it runs.',
          'ZCode has no env-var lookup for custom providers, so the gateway key is stored in ~/.zcode/v2/config.json (written 0600).',
        ],
        undo: 'remove the "Vercel AI Gateway" provider under Settings → Model settings in ZCode',
        confirm: 'ZCode is quit and writing the key into its config file is OK',
      },
    ];
  },

  buildPlan(ctx) {
    const baseURL = resolveGatewayBaseUrl(
      ctx.baseUrlOverride,
      GATEWAY_CODING_AGENT_BASE_URL
    );
    const models = seedModels(ctx);
    return {
      fileChanges: [
        {
          path: this.configPath(ctx),
          label: 'ZCode providers',
          format: 'json',
          mode: 0o600,
          transform: current => {
            const parsed = parseJsonObjectOrNull(current);
            const existingKey = findExistingGatewayKey(parsed, baseURL);
            const key = existingKey ?? ZCODE_PROVIDER_KEY;
            return mergeJson(current, {
              provider: {
                [key]: {
                  ...(existingKey ? {} : { name: ZCODE_PROVIDER_NAME }),
                  kind: ZCODE_KIND_OPENAI_COMPATIBLE,
                  options: {
                    apiKey: ctx.apiKey,
                    baseURL,
                    apiKeyRequired: true,
                  },
                  source: 'custom',
                  models,
                },
              },
            });
          },
        },
      ],
      envExports: [],
      notes: [
        `Open ZCode and pick a model under "${ZCODE_PROVIDER_NAME}" in the chat's model picker; ${Object.keys(models).length} gateway models are seeded and any other gateway model id can be added via Manage models → Add model.`,
        'Fresh install: choose "Skip for now" on ZCode\'s welcome screen — its API-key dropdown only takes Z.ai/BigModel accounts; the gateway provider lives in Settings → Model settings.',
        "When adding gateway providers by hand, keep the API format on Chat completions: ZCode's Anthropic-messages format sends a legacy thinking parameter that current Claude models reject (zai-org/feedback#233).",
      ],
    };
  },
};
