import output from '../../output-manager';
import {
  help as renderHelp,
  type Command,
  type CommandOption,
} from '../../commands/help';
import { homedir } from 'os';
import { isAbsolute, resolve as resolvePath } from 'path';
import type {
  OpenApiCommandTag,
  OpenApiInputNamesByTagOperation,
  OpenApiOperationIdsByTag,
} from './generated-command-dsl-types';
import { OpenApiCache } from './openapi-cache';
import { resolveEndpointByTagAndOperationId } from './resolve-by-tag-operation';
import type { BodyField, Parameter } from './types';
import { getLinkFromDir, getVercelDirectory } from '../projects/link';

type OptionalRecord<K extends PropertyKey, V> = {
  [P in K]?: V;
};

export interface InferredCommandConfig {
  alias: string[];
  arguments?: Record<string, InferredCommandParamConfig | undefined>;
  options?: Record<string, InferredCommandParamConfig | undefined>;
  examples?: InferredCommandExample[];
}

export interface InferredCommandParamConfig {
  required: boolean | 'project' | 'team';
  value?: string;
}

export interface InferredCommandExample {
  name: string;
  value: string;
}

type InferredInputNamesForOperation<
  Tag extends OpenApiCommandTag,
  OperationId extends OpenApiOperationIdsByTag[Tag],
> = Tag extends keyof OpenApiInputNamesByTagOperation
  ? OperationId extends keyof OpenApiInputNamesByTagOperation[Tag]
    ? Extract<OpenApiInputNamesByTagOperation[Tag][OperationId], string>
    : never
  : never;

type KnownInferredCommandConfig<
  Tag extends OpenApiCommandTag,
  OperationId extends OpenApiOperationIdsByTag[Tag],
> = Omit<InferredCommandConfig, 'arguments' | 'options'> & {
  arguments?: OptionalRecord<
    InferredInputNamesForOperation<Tag, OperationId>,
    InferredCommandParamConfig
  > &
    Record<string, InferredCommandParamConfig | undefined>;
  options?: OptionalRecord<
    InferredInputNamesForOperation<Tag, OperationId>,
    InferredCommandParamConfig
  > &
    Record<string, InferredCommandParamConfig | undefined>;
};

type KnownOperationsByTag<Tag extends OpenApiCommandTag> = {
  [OperationId in OpenApiOperationIdsByTag[Tag]]?: KnownInferredCommandConfig<
    Tag,
    OperationId
  >;
};

type KnownInferredCommands = {
  [Tag in OpenApiCommandTag]?: KnownOperationsByTag<Tag> &
    Record<string, InferredCommandConfig | undefined>;
};

export type InferredCommands = KnownInferredCommands &
  Record<string, Record<string, InferredCommandConfig | undefined> | undefined>;

export function inferCommands<const T extends InferredCommands>(
  commands: T
): T {
  return commands;
}

type ResolvedInferredCommand = {
  tag: string;
  operationId: string;
  config: InferredCommandConfig;
};

type InferredOperationParamMetadata = {
  name: string;
  required: boolean;
  type: string | null;
  description: string | null;
};

type InferredOperationBodyFieldMetadata = {
  name: string;
  required: boolean;
  type: string | null;
  description: string | null;
};

type InferredOperationMetadata = {
  method: string;
  path: string;
  summary: string | null;
  description: string | null;
  params: {
    path: InferredOperationParamMetadata[];
    query: InferredOperationParamMetadata[];
    header: InferredOperationParamMetadata[];
    cookie: InferredOperationParamMetadata[];
  };
  bodyFields: InferredOperationBodyFieldMetadata[];
};

type RunInferredCommandOptions = {
  help?: boolean;
  columns?: number;
  cwd?: string;
  scope?: string;
  team?: string;
  api?: string;
};

type ParamSurface = 'arguments' | 'options';
type ParameterLocation = 'path' | 'query' | 'header' | 'cookie' | 'bodyFields';

type ParsedCliInput = {
  positionals: string[];
  options: Record<string, string | boolean>;
};

type NormalizedParamDefinition = {
  inputKey: string;
  outputName: string;
  config: InferredCommandParamConfig;
  source: {
    location: ParameterLocation | null;
    name: string;
  };
};

type InferredCommandContext = {
  cwd: string;
  project: { id: string } | null;
  team: { value: string; source: '--scope' | '--team' | 'link' } | null;
};

type RequestPreview = {
  method: string | null;
  url: string | null;
  path: string | null;
  query: Record<string, string>;
  body: Record<string, string>;
};

function getDefaultOutputName(inputKey: string): string {
  const dotIndex = inputKey.lastIndexOf('.');
  return dotIndex === -1 ? inputKey : inputKey.slice(dotIndex + 1);
}

function normalizeOutputName(
  inputKey: string,
  valueOverride: string | undefined,
  surface: ParamSurface
): string {
  if (valueOverride) {
    return valueOverride;
  }

  const defaultOutputName = getDefaultOutputName(inputKey);
  if (defaultOutputName === 'teamId') {
    return surface === 'options' ? 'scope' : 'team';
  }

  return defaultOutputName;
}

function parseInputSource(inputKey: string): {
  location: ParameterLocation | null;
  name: string;
} {
  const dotIndex = inputKey.indexOf('.');
  if (dotIndex === -1) {
    return { location: null, name: inputKey };
  }

  const namespace = inputKey.slice(0, dotIndex);
  const name = inputKey.slice(dotIndex + 1);
  switch (namespace) {
    case 'path':
    case 'query':
    case 'header':
    case 'cookie':
    case 'bodyFields':
      return {
        location: namespace,
        name,
      };
    default:
      return {
        location: null,
        name: inputKey,
      };
  }
}

function normalizeParamDefinitions(
  configMap: Record<string, InferredCommandParamConfig | undefined> | undefined,
  surface: ParamSurface
): NormalizedParamDefinition[] {
  if (!configMap) {
    return [];
  }

  const definitions: NormalizedParamDefinition[] = [];
  for (const [inputKey, config] of Object.entries(configMap)) {
    if (!config) {
      continue;
    }

    definitions.push({
      inputKey,
      outputName: normalizeOutputName(inputKey, config.value, surface),
      config,
      source: parseInputSource(inputKey),
    });
  }

  return definitions;
}

function normalizeParamConfigs(
  configMap: Record<string, InferredCommandParamConfig | undefined> | undefined,
  surface: ParamSurface
): Record<string, InferredCommandParamConfig> | null {
  if (!configMap) {
    return null;
  }

  const normalized: Record<string, InferredCommandParamConfig> = {};
  for (const [inputKey, config] of Object.entries(configMap)) {
    if (!config) {
      continue;
    }

    const outputName = normalizeOutputName(inputKey, config.value, surface);
    normalized[outputName] = {
      ...config,
      value: outputName,
    };
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeOptionName(raw: string): string {
  if (raw === 'team' || raw === 'S') {
    return 'scope';
  }
  return raw;
}

function parseProvidedCliInput(tokens: string[]): ParsedCliInput {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (token === '--') {
      positionals.push(...tokens.slice(index + 1));
      break;
    }

    if (token.startsWith('--')) {
      const equalsIndex = token.indexOf('=');
      if (equalsIndex > -1) {
        const name = token.slice(2, equalsIndex);
        const value = token.slice(equalsIndex + 1);
        options[normalizeOptionName(name)] = value;
        continue;
      }

      const name = token.slice(2);
      const nextToken = tokens[index + 1];
      if (nextToken && !nextToken.startsWith('-')) {
        options[normalizeOptionName(name)] = nextToken;
        index++;
      } else {
        options[normalizeOptionName(name)] = true;
      }
      continue;
    }

    if (token.startsWith('-') && token.length > 1) {
      const name = token.slice(1);
      if (name.length === 1) {
        const nextToken = tokens[index + 1];
        if (nextToken && !nextToken.startsWith('-')) {
          options[normalizeOptionName(name)] = nextToken;
          index++;
        } else {
          options[normalizeOptionName(name)] = true;
        }
      } else {
        for (const shortName of name.split('')) {
          options[normalizeOptionName(shortName)] = true;
        }
      }
      continue;
    }

    positionals.push(token);
  }

  return { positionals, options };
}

function expandHomeDirectory(pathValue: string): string {
  if (pathValue === '~') {
    return homedir();
  }
  if (pathValue.startsWith('~/')) {
    return `${homedir()}${pathValue.slice(1)}`;
  }
  return pathValue;
}

function resolveCommandCwd(cwdOverride: string | undefined): string {
  if (!cwdOverride) {
    return process.cwd();
  }

  const expandedPath = expandHomeDirectory(cwdOverride);
  return isAbsolute(expandedPath)
    ? expandedPath
    : resolvePath(process.cwd(), expandedPath);
}

async function resolveInferredContext(
  cwdOverride: string | undefined,
  scopeOverride: string | undefined,
  teamOverride: string | undefined
): Promise<InferredCommandContext> {
  const cwd = resolveCommandCwd(cwdOverride);

  let linkedProject: { projectId: string; orgId: string } | null = null;
  try {
    linkedProject = await getLinkFromDir<{ projectId: string; orgId: string }>(
      getVercelDirectory(cwd)
    );
  } catch {
    linkedProject = null;
  }

  const scopeValue = scopeOverride ?? teamOverride;

  return {
    cwd,
    project: linkedProject?.projectId
      ? {
          id: linkedProject.projectId,
        }
      : null,
    team: scopeValue
      ? {
          value: scopeValue,
          source: scopeOverride ? '--scope' : '--team',
        }
      : linkedProject?.orgId
        ? {
            value: linkedProject.orgId,
            source: 'link',
          }
        : null,
  };
}

function normalizeApiBaseUrl(apiOverride: string | undefined): string {
  const fallback = 'https://api.vercel.com';
  if (!apiOverride) {
    return fallback;
  }

  try {
    return new URL(apiOverride).toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

function stringifyProvidedValue(value: string | boolean): string {
  return typeof value === 'string' ? value : String(value);
}

function buildRequestPreview(
  metadata: InferredOperationMetadata | null,
  argumentDefinitions: NormalizedParamDefinition[],
  optionDefinitions: NormalizedParamDefinition[],
  providedArguments: Record<string, string>,
  providedOptions: Record<string, string | boolean>,
  context: InferredCommandContext,
  apiOverride: string | undefined
): RequestPreview {
  if (!metadata) {
    return {
      method: null,
      url: null,
      path: null,
      query: {},
      body: {},
    };
  }

  const pathValues: Record<string, string> = {};
  const queryValues: Record<string, string> = {};
  const bodyValues: Record<string, string> = {};

  const assignValue = (
    definition: NormalizedParamDefinition,
    providedValue: string | boolean | undefined
  ) => {
    const value =
      providedValue ??
      (definition.config.required === 'project'
        ? context.project?.id
        : definition.config.required === 'team'
          ? context.team?.value
          : undefined);

    if (value === undefined || definition.source.location === null) {
      return;
    }

    const stringValue = stringifyProvidedValue(value);
    if (definition.source.location === 'path') {
      pathValues[definition.source.name] = stringValue;
      return;
    }
    if (definition.source.location === 'query') {
      queryValues[definition.source.name] = stringValue;
      return;
    }
    if (definition.source.location === 'bodyFields') {
      bodyValues[definition.source.name] = stringValue;
    }
  };

  for (const definition of argumentDefinitions) {
    assignValue(definition, providedArguments[definition.outputName]);
  }
  for (const definition of optionDefinitions) {
    assignValue(definition, providedOptions[definition.outputName]);
  }

  const path = metadata.path.replace(/\{([^}]+)\}/g, (full, token) => {
    const replacement = pathValues[token];
    return replacement ? encodeURIComponent(replacement) : full;
  });

  const query = Object.keys(queryValues)
    .sort()
    .reduce<Record<string, string>>((acc, key) => {
      acc[key] = queryValues[key];
      return acc;
    }, {});

  const queryString = new URLSearchParams(query).toString();
  const url = `${normalizeApiBaseUrl(apiOverride)}${path}${queryString ? `?${queryString}` : ''}`;

  return {
    method: metadata.method,
    url,
    path,
    query,
    body: bodyValues,
  };
}

function getRequiredHint(
  required: InferredCommandParamConfig['required']
): string {
  if (required === true) {
    return 'Required.';
  }
  if (required === 'project') {
    return 'Required when project context cannot infer it.';
  }
  if (required === 'team') {
    return 'Required when team context cannot infer it.';
  }
  return 'Optional.';
}

function buildMetadataByName(
  metadata: InferredOperationMetadata | null
): Record<string, { type: string | null; description: string | null }> {
  if (!metadata) {
    return {};
  }

  const byName: Record<
    string,
    { type: string | null; description: string | null }
  > = {};
  const sources = [
    ...metadata.params.path,
    ...metadata.params.query,
    ...metadata.params.header,
    ...metadata.params.cookie,
    ...metadata.bodyFields,
  ];

  for (const item of sources) {
    if (!byName[item.name]) {
      byName[item.name] = {
        type: item.type,
        description: item.description,
      };
    }
  }

  return byName;
}

function toHelpOption(
  name: string,
  config: InferredCommandParamConfig,
  metadataByName: Record<
    string,
    { type: string | null; description: string | null }
  >
): CommandOption {
  const metadata =
    metadataByName[name] ??
    (name === 'team' || name === 'scope' ? metadataByName.teamId : undefined);
  const descriptionParts = [
    metadata?.description ?? null,
    metadata?.type ? `Type: ${metadata.type}.` : null,
    getRequiredHint(config.required),
  ].filter(Boolean);

  return {
    name,
    shorthand: null,
    type: String,
    deprecated: false,
    description: descriptionParts.join(' '),
  };
}

function buildHelpOptions(
  normalizedOptions: Record<string, InferredCommandParamConfig>,
  metadataByName: Record<
    string,
    { type: string | null; description: string | null }
  >
): CommandOption[] {
  return Object.entries(normalizedOptions).map(([name, config]) =>
    toHelpOption(name, config, metadataByName)
  );
}

function printInferredCommandHelp(
  resolved: ResolvedInferredCommand,
  cliArgs: string[],
  metadata: InferredOperationMetadata | null,
  columns: number
): number {
  const commandName = cliArgs[1] ?? resolved.operationId;
  const normalizedArguments =
    normalizeParamConfigs(resolved.config.arguments, 'arguments') ?? {};
  const normalizedOptions =
    normalizeParamConfigs(resolved.config.options, 'options') ?? {};
  const metadataByName = buildMetadataByName(metadata);

  const command: Command = {
    name: commandName,
    aliases: commandName === resolved.operationId ? [] : [resolved.operationId],
    description:
      metadata?.summary ||
      metadata?.description ||
      `Inferred OpenAPI command for operation "${resolved.operationId}".`,
    arguments: Object.entries(normalizedArguments).map(([name, config]) => ({
      name,
      required: config.required === true,
    })),
    options: buildHelpOptions(normalizedOptions, metadataByName),
    examples: resolved.config.examples ?? [],
  };

  const parent: Command = {
    name: resolved.tag,
    aliases: [],
    description: `OpenAPI tag "${resolved.tag}"`,
    arguments: [],
    options: [],
    examples: [],
  };

  output.print(
    renderHelp(command, {
      parent,
      columns,
    })
  );
  return 0;
}

export function resolveInferredCommand(
  commands: InferredCommands,
  cliArgs: string[]
): ResolvedInferredCommand | null {
  const [tag, operationToken] = cliArgs;
  if (!tag || !operationToken) {
    return null;
  }

  const commandsByTag = commands[tag];
  if (!commandsByTag) {
    return null;
  }

  const directMatch = commandsByTag[operationToken];
  if (directMatch) {
    return {
      tag,
      operationId: operationToken,
      config: directMatch,
    };
  }

  for (const [operationId, config] of Object.entries(commandsByTag)) {
    if (!config) {
      continue;
    }

    if (config.alias.includes(operationToken)) {
      return {
        tag,
        operationId,
        config,
      };
    }
  }

  return null;
}

function serializeParameter(param: Parameter): InferredOperationParamMetadata {
  return {
    name: param.name,
    required: Boolean(param.required),
    type: param.schema?.type ?? null,
    description: param.description ?? null,
  };
}

function serializeBodyField(
  field: BodyField
): InferredOperationBodyFieldMetadata {
  return {
    name: field.name,
    required: field.required,
    type: field.type ?? null,
    description: field.description ?? null,
  };
}

async function getInferredOperationMetadata(
  tag: string,
  operationId: string
): Promise<InferredOperationMetadata | null> {
  const openApi = new OpenApiCache();
  const loaded = await openApi.load();
  if (!loaded) {
    return null;
  }

  const endpoints = openApi.getEndpoints();
  const resolved = resolveEndpointByTagAndOperationId(
    endpoints,
    tag,
    operationId
  );
  if (!resolved.ok) {
    return null;
  }

  const endpoint = resolved.endpoint;
  const params = {
    path: endpoint.parameters
      .filter(param => param.in === 'path')
      .map(serializeParameter),
    query: endpoint.parameters
      .filter(param => param.in === 'query')
      .map(serializeParameter),
    header: endpoint.parameters
      .filter(param => param.in === 'header')
      .map(serializeParameter),
    cookie: endpoint.parameters
      .filter(param => param.in === 'cookie')
      .map(serializeParameter),
  };

  return {
    method: endpoint.method,
    path: endpoint.path,
    summary: endpoint.summary || null,
    description: endpoint.description || null,
    params,
    bodyFields: openApi.getBodyFields(endpoint).map(serializeBodyField),
  };
}

/**
 * Return an exit code when a DSL-inferred command is handled.
 * Returns `null` when command routing should continue as normal.
 */
export async function runInferredCommand(
  commands: InferredCommands,
  cliArgs: string[],
  options: RunInferredCommandOptions = {}
): Promise<number | null> {
  const resolved = resolveInferredCommand(commands, cliArgs);
  if (!resolved) {
    return null;
  }

  const metadata = await getInferredOperationMetadata(
    resolved.tag,
    resolved.operationId
  );

  if (options.help) {
    return printInferredCommandHelp(
      resolved,
      cliArgs,
      metadata,
      options.columns ?? 80
    );
  }

  const argumentDefinitions = normalizeParamDefinitions(
    resolved.config.arguments,
    'arguments'
  );
  const optionDefinitions = normalizeParamDefinitions(
    resolved.config.options,
    'options'
  );
  const knownOptionNames = new Set(
    optionDefinitions.map(def => def.outputName)
  );
  const parsedInput = parseProvidedCliInput(cliArgs.slice(2));
  const parsedOptions = {
    ...parsedInput.options,
  };
  if (options.scope) {
    parsedOptions.scope = options.scope;
  }
  if (options.team && !options.scope) {
    parsedOptions.scope = options.team;
  }
  if (options.cwd) {
    parsedOptions.cwd = options.cwd;
  }
  if (options.api) {
    parsedOptions.api = options.api;
  }

  const providedArguments = argumentDefinitions.reduce<Record<string, string>>(
    (acc, definition, index) => {
      const value = parsedInput.positionals[index];
      if (value !== undefined) {
        acc[definition.outputName] = value;
      }
      return acc;
    },
    {}
  );

  const providedOptions = optionDefinitions.reduce<
    Record<string, string | boolean>
  >((acc, definition) => {
    const value = parsedOptions[definition.outputName];
    if (value !== undefined) {
      acc[definition.outputName] = value;
    }
    return acc;
  }, {});

  const extraOptions = Object.entries(parsedOptions).reduce<
    Record<string, string | boolean>
  >((acc, [name, value]) => {
    if (!knownOptionNames.has(name)) {
      acc[name] = value;
    }
    return acc;
  }, {});

  const context = await resolveInferredContext(
    typeof parsedOptions.cwd === 'string' ? parsedOptions.cwd : undefined,
    typeof parsedOptions.scope === 'string' ? parsedOptions.scope : undefined,
    typeof parsedOptions.team === 'string' ? parsedOptions.team : undefined
  );

  const request = buildRequestPreview(
    metadata,
    argumentDefinitions,
    optionDefinitions,
    providedArguments,
    providedOptions,
    context,
    typeof parsedOptions.api === 'string' ? parsedOptions.api : undefined
  );

  output.log('Inferred OpenAPI command matched before native command dispatch');
  output.print(
    JSON.stringify(
      {
        tag: resolved.tag,
        operationId: resolved.operationId,
        alias: resolved.config.alias,
        matchedAlias:
          resolved.operationId === cliArgs[1] ? null : (cliArgs[1] ?? null),
        context,
        provided: {
          arguments: providedArguments,
          options: providedOptions,
          extraArguments: parsedInput.positionals.slice(
            argumentDefinitions.length
          ),
          extraOptions,
        },
        request,
      },
      null,
      2
    )
  );
  return 0;
}
