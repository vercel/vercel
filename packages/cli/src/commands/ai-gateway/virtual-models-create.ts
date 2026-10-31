import chalk from 'chalk';
import type Client from '../../util/client';
import {
  createVirtualModel,
  getVirtualModel,
  invalidProviderOptions,
  parseConfigFlag,
  splitList,
  VIRTUAL_MODEL_KINDS,
  type VirtualModelInput,
  type VirtualModelKind,
} from '../../util/ai-gateway/virtual-models';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import {
  listModelEndpoints,
  listModels,
  type Model,
} from '../../util/ai-gateway/models';
import { CHECKBOX_INSTRUCTIONS } from '../../util/input/checkbox-instructions';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayVirtualModelsCreateTelemetryClient } from '../../util/telemetry/commands/ai-gateway/virtual-models-create';
import { virtualModelsCreateSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { getCommandNamePlain } from '../../util/pkg-name';

/** Keeps the provider hint readable for models served by many providers. */
const MAX_PROVIDERS_IN_PROMPT = 8;

export default async function create(client: Client, argv: string[]) {
  const telemetry = new AiGatewayVirtualModelsCreateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    virtualModelsCreateSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { args, flags: opts } = parsedArgs;

  const config = parseConfigFlag(opts['--config'] as string | undefined);
  if (!config.ok) {
    output.error(config.error);
    return 1;
  }

  const [slugArg] = args;
  const kindFlag = opts['--kind'] as string | undefined;
  const modelFlag = opts['--model'] as string | undefined;

  telemetry.trackCliArgumentSlug(slugArg);
  telemetry.trackCliOptionKind(kindFlag);
  telemetry.trackCliOptionModel(modelFlag);
  telemetry.trackCliOptionDisplayName(opts['--display-name']);
  telemetry.trackCliOptionDescription(opts['--description']);
  telemetry.trackCliOptionProviderOrder(opts['--provider-order']);
  telemetry.trackCliOptionProviderOnly(opts['--provider-only']);
  telemetry.trackCliOptionConfig(opts['--config']);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  const merged: Record<string, unknown> = {
    ...config.value,
    ...definedOnly({
      virtualModelSlug: slugArg,
      kind: kindFlag,
      modelSlug: modelFlag,
      displayName: opts['--display-name'] as string | undefined,
      description: opts['--description'] as string | undefined,
      providerOrder: splitList(opts['--provider-order'] as string | undefined),
      providerOnly: splitList(opts['--provider-only'] as string | undefined),
    }),
  };

  // Three separate conditions: `nonInteractive` misses an agent attached to a
  // pty, and neither covers a plain piped invocation.
  const canPrompt =
    Boolean(client.stdin.isTTY) && !client.nonInteractive && !client.isAgent;
  let wizard = false;

  if (!merged.virtualModelSlug) {
    if (!canPrompt) {
      const message =
        'A slug is required. Pass it as an argument, in --config, or run interactively.';
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message,
          next: [
            {
              command: getCommandNamePlain(
                'ai-gateway virtual-models create <slug> --model <provider/model>'
              ),
            },
          ],
        },
        2
      );
      output.error(message);
      return 2;
    }
    wizard = true;
    merged.virtualModelSlug = await client.input.text({
      message: 'Slug for the virtual model (called as vmc/<slug>):',
      validate: async (value: string) => {
        const slug = value.trim();
        if (!slug) return 'A slug is required.';
        if (!/^[a-zA-Z0-9_.-]+$/.test(slug)) {
          return 'Letters, numbers, hyphens, underscores, periods only.';
        }
        if (!client.config.currentTeam) return true;
        try {
          await getVirtualModel(client, slug);
          return 'That slug is already taken.';
        } catch {
          // The lookup is a nicety; the api stays the backstop.
          return true;
        }
      },
    });
  }

  // Relay creation is allowlist-gated server-side and needs a baseUrl there is
  // no flag for, so it is accepted via --kind but never offered in the wizard.
  merged.kind ??= 'alias';

  if (!VIRTUAL_MODEL_KINDS.includes(merged.kind as VirtualModelKind)) {
    output.error(`--kind must be one of: ${VIRTUAL_MODEL_KINDS.join(', ')}.`);
    return 2;
  }

  // Lazily fetched and shared by the model picker and the field validators.
  // Both degrade to no validation when the fetch fails; the api backstops.
  let catalogPromise: Promise<Model[]> | undefined;
  const getCatalog = (): Promise<Model[]> => {
    catalogPromise ??= listModels(client).catch(() => [] as Model[]);
    return catalogPromise;
  };
  let providersPromise: Promise<string[]> | undefined;
  const getProviders = (): Promise<string[]> => {
    providersPromise ??= listModelEndpoints(client, String(merged.modelSlug))
      .then(data => [
        ...new Set(data.endpoints.map(endpoint => endpoint.provider_name)),
      ])
      .catch(() => [] as string[]);
    return providersPromise;
  };

  if (!merged.modelSlug) {
    if (!canPrompt) {
      const message =
        'A target model is required. Pass --model, put modelSlug in --config, or run interactively.';
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message,
          next: [
            {
              command: getCommandNamePlain(
                'ai-gateway virtual-models create <slug> --model <provider/model>'
              ),
            },
          ],
        },
        2
      );
      output.error(message);
      return 2;
    }
    wizard = true;
    const catalog = await getCatalog();
    if (catalog.length > 0) {
      merged.modelSlug = await client.input.search<string>({
        message: `Model this virtual model points at (${catalog.length} available):`,
        pageSize: 15,
        source: term => {
          const searchTerm = term?.trim().toLowerCase();
          const matches = searchTerm
            ? catalog.filter(
                model =>
                  model.id.toLowerCase().includes(searchTerm) ||
                  (model.name ?? '').toLowerCase().includes(searchTerm)
              )
            : catalog;
          return matches.map(model => ({ name: model.id, value: model.id }));
        },
      });
    } else {
      merged.modelSlug = await client.input.text({
        message: 'Model this virtual model points at (e.g. openai/gpt-5.1):',
        validate: (value: string) =>
          value.trim().length > 0 ? true : 'A model is required.',
      });
    }
  }

  if (wizard && opts['--config'] === undefined) {
    const picked = await client.input.checkbox<string>({
      message: `Which fields would you like to set?${CHECKBOX_INSTRUCTIONS}`,
      instructions: false,
      choices: [
        { name: 'Display name', value: 'displayName' },
        { name: 'Description', value: 'description' },
        { name: 'Model fallbacks', value: 'models' },
        { name: 'Provider order', value: 'providerOrder' },
        { name: 'Only these providers', value: 'providerOnly' },
        { name: 'Sort by', value: 'sort' },
        { name: 'Service tier', value: 'serviceTier' },
        { name: 'Prompt caching', value: 'caching' },
        { name: 'Fast mode', value: 'speed' },
        { name: 'Required capabilities', value: 'has' },
        { name: 'Observability tags', value: 'observabilityTags' },
        { name: 'Zero data retention', value: 'zeroDataRetention' },
        { name: 'Disallow prompt training', value: 'disallowPromptTraining' },
        { name: 'Provider options (JSON)', value: 'providerOptions' },
        { name: 'Other fields (raw JSON)', value: 'otherJson' },
      ],
    });

    const csvPrompt = async (
      message: string,
      field: string,
      validateEntry?: (entry: string) => Promise<string | true>
    ): Promise<void> => {
      const value = splitList(
        await client.input.text({
          message,
          validate: async (v: string) => {
            const entries = splitList(v);
            if (!entries) return 'Enter at least one value.';
            if (validateEntry) {
              for (const entry of entries) {
                const result = await validateEntry(entry);
                if (result !== true) return result;
              }
            }
            return true;
          },
        })
      );
      if (value && merged[field] === undefined) merged[field] = value;
    };

    const providerEntryValidator = async (
      entry: string
    ): Promise<string | true> => {
      const providers = await getProviders();
      if (providers.length === 0) return true;
      return providers.includes(entry)
        ? true
        : `Unknown provider: ${entry}. This model is served by: ${providers.join(', ')}.`;
    };

    // The validator already knows which providers serve this model, so name
    // them in the question instead of letting the user guess and fail. A lone
    // provider is the answer rather than an example, so it gets no hint.
    const providerPrompt = async (label: string): Promise<string> => {
      const providers = await getProviders();
      if (providers.length < 2) return `${label}, comma-separated:`;
      const shown = providers.slice(0, MAX_PROVIDERS_IN_PROMPT).join(', ');
      const rest = providers.length - MAX_PROVIDERS_IN_PROMPT;
      return rest > 0
        ? `${label}, comma-separated (available: ${shown}, and ${rest} more):`
        : `${label}, comma-separated (available: ${shown}):`;
    };

    const modelEntryValidator = async (
      entry: string
    ): Promise<string | true> => {
      const catalog = await getCatalog();
      if (catalog.length === 0) return true;
      return catalog.some(model => model.id === entry)
        ? true
        : `Unknown model: ${entry}.`;
    };

    for (const field of picked) {
      switch (field) {
        case 'displayName':
        case 'description': {
          const label =
            field === 'displayName' ? 'Display name' : 'Description';
          const value = await client.input.text({ message: `${label}:` });
          if (value.trim() && merged[field] === undefined)
            merged[field] = value.trim();
          break;
        }
        case 'models':
          await csvPrompt(
            'Fallback models, comma-separated (e.g. moonshotai/kimi-k2-thinking, zai/glm-5.1):',
            'models',
            modelEntryValidator
          );
          break;
        case 'providerOrder':
          await csvPrompt(
            await providerPrompt('Providers to try first'),
            'providerOrder',
            providerEntryValidator
          );
          break;
        case 'providerOnly':
          await csvPrompt(
            await providerPrompt('Restrict to these providers'),
            'providerOnly',
            providerEntryValidator
          );
          break;
        case 'observabilityTags':
          await csvPrompt(
            'Observability tags, comma-separated (letters, numbers, . _ -):',
            'observabilityTags',
            async entry =>
              /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(entry)
                ? true
                : `Invalid tag: ${entry}. Letters, numbers, . _ -, starting alphanumeric.`
          );
          break;
        case 'sort': {
          const value = await client.input.select<string>({
            message: 'Sort providers by:',
            choices: [
              { name: 'Cost (cheapest first)', value: 'cost' },
              { name: 'Time to first token', value: 'ttft' },
              { name: 'Tokens per second', value: 'tps' },
            ],
          });
          if (merged.sort === undefined) merged.sort = value;
          break;
        }
        case 'serviceTier': {
          const value = await client.input.select<string>({
            message: 'Service tier:',
            choices: [
              { name: 'Flex (cheaper, may be slower)', value: 'flex' },
              { name: 'Priority (higher per-token rate)', value: 'priority' },
            ],
          });
          if (merged.serviceTier === undefined) merged.serviceTier = value;
          break;
        }
        case 'caching': {
          const value = await client.input.confirm(
            'Enable automatic prompt caching?',
            true
          );
          if (value && merged.caching === undefined) merged.caching = 'auto';
          break;
        }
        case 'speed': {
          const value = await client.input.confirm('Enable fast mode?', false);
          if (value && merged.speed === undefined) {
            merged.speed = 'fast';
            const fallback = await client.input.confirm(
              'Allow fallback to standard providers when fast ones are unavailable?',
              false
            );
            if (fallback && merged.allowFallbackFromFast === undefined)
              merged.allowFallbackFromFast = true;
          }
          break;
        }
        case 'has': {
          const value = await client.input.checkbox<string>({
            message: `Require providers with these capabilities:${CHECKBOX_INSTRUCTIONS}`,
            instructions: false,
            choices: [
              { name: 'Implicit caching', value: 'implicit-caching' },
              { name: 'Vision', value: 'vision' },
            ],
          });
          if (value.length > 0 && merged.has === undefined) merged.has = value;
          break;
        }
        case 'zeroDataRetention':
        case 'disallowPromptTraining': {
          const labels: Record<string, string> = {
            zeroDataRetention: 'Require zero data retention?',
            disallowPromptTraining: 'Disallow providers that train on prompts?',
          };
          const value = await client.input.confirm(labels[field], false);
          if (value && merged[field] === undefined) merged[field] = true;
          break;
        }
        case 'providerOptions': {
          const raw = await client.input.text({
            message:
              'Provider options as JSON, e.g. {"anthropic": {"effort": "high"}}:',
            validate: (v: string) => {
              let parsed: unknown;
              try {
                parsed = JSON.parse(v);
              } catch {
                return 'Provider options must be valid JSON.';
              }
              return invalidProviderOptions(parsed) ?? true;
            },
          });
          if (merged.providerOptions === undefined)
            merged.providerOptions = JSON.parse(raw);
          break;
        }
        case 'otherJson': {
          const raw = await client.input.text({
            message:
              'JSON object of additional fields.\nAvailable: status, visibility, baseUrl, inferenceRegion,\n  providerTimeouts, displayName, description, models, providerOrder,\n  providerOnly, sort, serviceTier, caching, speed, allowFallbackFromFast,\n  has, providerOptions, observabilityTags, zeroDataRetention,\n  disallowPromptTraining.\nExample: {"sort": "cost"} or {"providerOptions": {"anthropic": {"effort": "high"}}}:',
            validate: (v: string) => {
              const result = parseConfigFlag(v, 'The value');
              return result.ok ? true : result.error;
            },
          });
          const parsed = parseConfigFlag(raw, 'The value');
          if (!parsed.ok) {
            output.error(parsed.error);
            return 1;
          }
          for (const [key, value] of Object.entries(parsed.value)) {
            if (merged[key] === undefined) merged[key] = value;
          }
          break;
        }
      }
    }
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  const createStamp = stamp();
  output.spinner('Creating virtual model');

  try {
    const virtualModel = await createVirtualModel(
      client,
      merged as unknown as VirtualModelInput
    );

    output.stopSpinner();

    if (asJson) {
      client.stdout.write(`${JSON.stringify(virtualModel, null, 2)}\n`);
    } else {
      client.stdout.write(`${virtualModel.virtualModelSlug}\n`);
      output.success(
        `Virtual model ${chalk.bold(virtualModel.virtualModelSlug)} created ${createStamp()}. Call it as ${chalk.bold(`vmc/${virtualModel.virtualModelSlug}`)}.`
      );
    }

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}

function definedOnly(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}
