import { dirname, join, resolve } from 'node:path';
import { dump, load } from 'js-yaml';
import type { CodingAgent, SetupContext } from '../types';
import type { Model } from '../../models';
import { mergeJson, pathExists } from '../config-files';
import {
  GATEWAY_CODING_AGENT_BASE_URL,
  GATEWAY_DEFAULT_MODEL,
} from '../gateway';

type YamlObject = Record<string, unknown>;

// Aider reads `~/.aider.conf.yml`; the key stays in the shell as the aider-specific
// AIDER_OPENAI_API_KEY. The `openai/` prefix routes ids through openai-api-base, and
// aider has no catalogue entries for prefixed ids, so metadata/settings are written
// from the gateway catalogue: unsized models are dropped (registering one would
// silence the warning but keep aider's 1k context floors) and `edit_format` is the
// field that overrides aider's `whole`-file default for unrecognised ids.
const METADATA_FILE = '.aider.model.metadata.json';
const SETTINGS_FILE = '.aider.model.settings.yml';

function aiderModelId(gatewayModelId: string): string {
  return `openai/${gatewayModelId}`;
}

function chatModels(ctx: SetupContext): Model[] {
  return (ctx.gatewayModels ?? []).filter(
    m => m.type === 'language' && m.context_window
  );
}

function costPerToken(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function modelMetadata(models: Model[]): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const model of models) {
    const input = costPerToken(model.pricing?.input);
    const output = costPerToken(model.pricing?.output);
    entries[aiderModelId(model.id)] = {
      max_input_tokens: model.context_window,
      ...(model.max_tokens
        ? { max_output_tokens: model.max_tokens, max_tokens: model.max_tokens }
        : {}),
      ...(input === undefined ? {} : { input_cost_per_token: input }),
      ...(output === undefined ? {} : { output_cost_per_token: output }),
      litellm_provider: 'openai',
      mode: 'chat',
    };
  }
  return entries;
}

function modelSettings(
  models: Model[]
): { name: string; settings: YamlObject }[] {
  return models.map(model => ({
    name: aiderModelId(model.id),
    settings: { edit_format: 'diff', use_repo_map: true },
  }));
}

function asObject(value: unknown): YamlObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as YamlObject)
    : {};
}

function upsertNamedYamlList(
  current: string | null,
  entries: { name: string; settings: YamlObject }[]
): string {
  const loaded = current?.trim() ? load(current) : [];
  if (loaded != null && !Array.isArray(loaded)) {
    throw new Error('existing file is not a YAML list');
  }
  const list = Array.isArray(loaded) ? [...loaded] : [];
  const indexByName = new Map<unknown, number>();
  list.forEach((item, i) => {
    const name = asObject(item).name;
    if (name !== undefined && !indexByName.has(name)) {
      indexByName.set(name, i);
    }
  });
  for (const { name, settings } of entries) {
    const index = indexByName.get(name);
    if (index === undefined) {
      indexByName.set(name, list.length);
      list.push({ name, ...settings });
    } else {
      list[index] = { name, ...asObject(list[index]), ...settings };
    }
  }
  return dump(list, { lineWidth: 120 });
}

export const aider: CodingAgent = {
  id: 'aider',
  displayName: 'Aider',
  needsModelCatalogue: true,
  needsTopModels: true,

  async detect(home) {
    return (
      (await pathExists(join(home, '.aider'))) ||
      pathExists(join(home, '.aider.conf.yml'))
    );
  },

  configPath(ctx) {
    return ctx.overrides?.['aider'] ?? join(ctx.home, '.aider.conf.yml');
  },

  buildPlan(ctx) {
    const model = aiderModelId(ctx.topModels?.[0]?.id ?? GATEWAY_DEFAULT_MODEL);
    const path = this.configPath(ctx);
    const dir = dirname(path);
    const metadataPath = join(dir, METADATA_FILE);
    const settingsPath = join(dir, SETTINGS_FILE);
    const base = ctx.baseUrlOverride ?? GATEWAY_CODING_AGENT_BASE_URL;
    const models = chatModels(ctx);
    const needsExplicitPaths =
      models.length > 0 && resolve(dir) !== resolve(ctx.home);
    return {
      fileChanges: [
        {
          path,
          label: 'Aider config',
          format: 'yaml' as const,
          transform: (current: string | null) => {
            const config = asObject(load(current ?? '') ?? {});
            config['openai-api-base'] = base;
            config.model = model;
            if (needsExplicitPaths) {
              config['model-metadata-file'] = metadataPath;
              config['model-settings-file'] = settingsPath;
            }
            return dump(config, { lineWidth: 120 });
          },
        },
        ...(models.length
          ? [
              {
                path: metadataPath,
                label: 'Aider model metadata',
                format: 'json' as const,
                transform: (current: string | null) =>
                  mergeJson(current, modelMetadata(models)),
              },
              {
                path: settingsPath,
                label: 'Aider model settings',
                format: 'yaml' as const,
                transform: (current: string | null) =>
                  upsertNamedYamlList(current, modelSettings(models)),
              },
            ]
          : []),
      ],
      envExports: [{ name: 'AIDER_OPENAI_API_KEY', value: ctx.apiKey }],
      notes: [
        `Aider will use the gateway with ${model}; switch with \`aider --model openai/<gateway-model-id>\` or /model in a session.`,
        ...(models.length
          ? [
              `${models.length} gateway models are registered in ${METADATA_FILE}; re-run setup to pick up models added since.`,
            ]
          : []),
        'Open a new terminal first so AIDER_OPENAI_API_KEY is loaded.',
      ],
    };
  },
};
