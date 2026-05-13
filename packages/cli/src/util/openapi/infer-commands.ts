import output from '../../output-manager';
import {
  help as renderHelp,
  type Command,
  type CommandArgument,
  type CommandOption,
} from '../../commands/help';
import { formatOutput } from '../../commands/api/request-builder';
import chalk from 'chalk';
import { homedir } from 'os';
import { isAbsolute, resolve as resolvePath } from 'path';
import type Client from '../client';
import type {
  OpenApiCommandTag,
  OpenApiInputNamesByTagOperation,
  OpenApiOperationIdsByTag,
} from './generated-command-dsl-types';
import { OpenApiCache } from './openapi-cache';
import { resolveEndpointByTagAndOperationId } from './resolve-by-tag-operation';
import type { BodyField, Parameter } from './types';
import { getLinkFromDir, getVercelDirectory } from '../projects/link';
import getUser from '../get-user';

type OptionalRecord<K extends PropertyKey, V> = {
  [P in K]?: V;
};

export interface InferredCommandConfig {
  value?: string;
  arguments?: Record<string, InferredCommandParamConfig | undefined>;
  options?: Record<string, InferredCommandParamConfig | undefined>;
  examples?: InferredCommandExample[];
}

export interface InferredTagConfig {
  name?: string;
  aliases?: string[];
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

type KnownTagConfig<Tag extends OpenApiCommandTag> = InferredTagConfig &
  KnownOperationsByTag<Tag> &
  Record<string, InferredCommandConfig | undefined>;

type KnownInferredCommands = {
  [Tag in OpenApiCommandTag]?: KnownTagConfig<Tag>;
};

export type InferredCommands = KnownInferredCommands &
  Record<string, (InferredTagConfig & Record<string, unknown>) | undefined>;

export function inferCommands<const T extends InferredCommands>(
  commands: T
): T {
  return commands;
}

type ResolvedInferredCommand = {
  tag: string;
  tagName: string;
  tagAliases: string[];
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
  client?: Client;
  execute?: boolean;
  help?: boolean;
  columns?: number;
  dryRun?: boolean;
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
  team: {
    value: string;
    source: '--scope' | '--team' | 'link' | 'current-team' | 'default-team';
  } | null;
};

type RequestPreview = {
  method: string | null;
  url: string | null;
  path: string | null;
  query: Record<string, string>;
  body: Record<string, string>;
};

type InferredDryRunPreview = {
  tag: string;
  operationId: string;
  matchedValue: string | null;
  context: InferredCommandContext;
  provided: {
    arguments: Record<string, string>;
    options: Record<string, string | boolean>;
    extraArguments: string[];
    extraOptions: Record<string, string | boolean>;
  };
  request: RequestPreview;
};

type TagOperationOverview = {
  operationId: string;
  value: string;
  arguments: CommandArgument[];
};

type ResolvedTagConfig = {
  key: string;
  name: string;
  aliases: string[];
  operations: Record<string, InferredCommandConfig>;
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
  teamOverride: string | undefined,
  client?: Client
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
  let teamFromClient: InferredCommandContext['team'] = null;

  if (!scopeValue && !linkedProject?.orgId && client?.config.currentTeam) {
    teamFromClient = {
      value: client.config.currentTeam,
      source: 'current-team',
    };
  }

  if (!scopeValue && !linkedProject?.orgId && !teamFromClient && client) {
    try {
      const user = await getUser(client);
      if (user.version === 'northstar' && user.defaultTeamId) {
        teamFromClient = {
          value: user.defaultTeamId,
          source: 'default-team',
        };
      }
    } catch {
      // Best-effort fallback only; command execution can proceed without team context.
    }
  }

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
        : teamFromClient,
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

function stringifyPreviewCell(value: unknown): string {
  if (value === null || value === undefined) {
    return chalk.gray('--');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function renderSectionRows(rows: Array<[string, string]>): string {
  if (rows.length === 0) {
    return `  ${chalk.gray('(empty)')}  ${chalk.gray('--')}`;
  }

  const maxKeyLength = rows.reduce(
    (max, [key]) => Math.max(max, key.length),
    0
  );
  return rows
    .map(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      return `  ${chalk.gray(paddedKey)}  ${value}`;
    })
    .join('\n');
}

function renderKeyValueSection(
  title: string,
  entries: Array<[string, unknown]>
): string {
  const rows: Array<[string, string]> =
    entries.length > 0
      ? entries.map(([key, value]) => [key, stringifyPreviewCell(value)])
      : [];
  return `${chalk.bold.cyan(`${title}:`)}\n${renderSectionRows(rows)}`;
}

function renderRecordSection(
  title: string,
  record: Record<string, unknown>
): string {
  const entries = Object.keys(record)
    .sort()
    .map(key => [key, record[key]] as [string, unknown]);
  return renderKeyValueSection(title, entries);
}

function renderListSection(title: string, values: string[]): string {
  if (values.length === 0) {
    return renderKeyValueSection(title, []);
  }
  const rows: Array<[string, string]> = values.map((value, index) => [
    String(index + 1),
    value,
  ]);
  return `${chalk.bold.cyan(`${title}:`)}\n${renderSectionRows(rows)}`;
}

function printDryRunPreview(preview: InferredDryRunPreview): void {
  const sections = [
    chalk.bold(
      `Inferred command dry run: ${preview.tag} ${preview.matchedValue ?? preview.operationId}`
    ),
    renderKeyValueSection('Request', [
      ['tag', preview.tag],
      ['operation', preview.operationId],
      [
        'method',
        preview.request.method ? chalk.green(preview.request.method) : null,
      ],
      ['path', preview.request.path],
    ]),
    renderKeyValueSection('Context', [
      ['cwd', preview.context.cwd],
      ['project', preview.context.project?.id ?? null],
      ['team', preview.context.team?.value ?? null],
      ['teamSource', preview.context.team?.source ?? null],
    ]),
    renderRecordSection('Provided Arguments', preview.provided.arguments),
    renderRecordSection('Provided Options', preview.provided.options),
    renderListSection('Extra Arguments', preview.provided.extraArguments),
    renderRecordSection('Extra Options', preview.provided.extraOptions),
    renderRecordSection('Request Query', preview.request.query),
    renderRecordSection('Request Body', preview.request.body),
  ];

  output.print(sections.join('\n\n'));
}

function isEnabledFlag(value: string | boolean | undefined): boolean {
  return value === true || value === '' || value === 'true';
}

async function executeInferredRequest(
  client: Client,
  request: RequestPreview,
  parsedOptions: Record<string, string | boolean>
): Promise<number> {
  if (!request.url || !request.method) {
    output.error('Could not resolve inferred OpenAPI request.');
    return 1;
  }

  const method = request.method.toUpperCase();
  const hasBody =
    Object.keys(request.body).length > 0 &&
    method !== 'GET' &&
    method !== 'HEAD';

  if (isEnabledFlag(parsedOptions.verbose)) {
    output.debug(`Request: ${method} ${request.url}`);
    if (hasBody) {
      output.debug(`Body: ${JSON.stringify(request.body)}`);
    }
  }

  try {
    const confirmed = await client.confirmMutatingOperation(
      request.url,
      method
    );
    if (!confirmed) {
      return 1;
    }

    const response = await client.fetch(request.url, {
      method,
      body: hasBody ? request.body : undefined,
      headers: {},
      json: false,
    });

    if (isEnabledFlag(parsedOptions.include)) {
      client.stdout.write(`HTTP ${response.status} ${response.statusText}\n`);
      response.headers.forEach((value, key) => {
        client.stdout.write(`${key}: ${value}\n`);
      });
      client.stdout.write('\n');
    }

    if (isEnabledFlag(parsedOptions.silent)) {
      return 0;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await response.json();
      client.stdout.write(
        `${formatOutput(body, { raw: isEnabledFlag(parsedOptions.raw) })}\n`
      );
      return 0;
    }

    const body = await response.text();
    client.stdout.write(body.endsWith('\n') ? body : `${body}\n`);
    return 0;
  } catch (error) {
    output.prettyError(error);
    return 1;
  }
}

function stripHelpTokens(args: string[]): string[] {
  return args.filter(token => token !== '-h' && token !== '--help');
}

function getCommandValue(
  operationId: string,
  config: InferredCommandConfig
): string {
  return config.value ?? operationId;
}

function isInferredCommandConfig(
  value: unknown
): value is InferredCommandConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toResolvedTagConfig(
  key: string,
  config: (InferredTagConfig & Record<string, unknown>) | undefined
): ResolvedTagConfig | null {
  if (!config) {
    return null;
  }

  const entries = Object.entries(config).filter(
    ([entryKey, entryValue]) =>
      entryKey !== 'name' &&
      entryKey !== 'aliases' &&
      isInferredCommandConfig(entryValue)
  );

  if (entries.length === 0) {
    return null;
  }

  return {
    key,
    name: config.name ?? key,
    aliases: config.aliases ?? [],
    operations: Object.fromEntries(entries) as Record<
      string,
      InferredCommandConfig
    >,
  };
}

function getResolvedTags(commands: InferredCommands): ResolvedTagConfig[] {
  return Object.entries(commands)
    .map(([key, config]) => toResolvedTagConfig(key, config))
    .filter((tag): tag is ResolvedTagConfig => Boolean(tag))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getConfiguredTags(commands: InferredCommands): ResolvedTagConfig[] {
  return getResolvedTags(commands);
}

function resolveTagConfig(
  commands: InferredCommands,
  tagToken: string
): ResolvedTagConfig | null {
  return (
    getResolvedTags(commands).find(
      tag =>
        tagToken === tag.name ||
        tagToken === tag.key ||
        tag.aliases.includes(tagToken)
    ) ?? null
  );
}

function getTagOperations(tag: ResolvedTagConfig): TagOperationOverview[] {
  return Object.entries(tag.operations)
    .filter(([_operationId, config]) => Boolean(config))
    .map(([operationId, config]) => ({
      operationId,
      value: getCommandValue(operationId, config),
      arguments: normalizeParamDefinitions(config.arguments, 'arguments').map(
        definition => ({
          name: definition.outputName,
          required: definition.config.required === true,
        })
      ),
    }))
    .sort((a, b) => a.operationId.localeCompare(b.operationId));
}

function printTagsOverview(commands: InferredCommands): number {
  const rows: Array<[string, string]> = getConfiguredTags(commands).map(tag => [
    tag.name,
    `${getTagOperations(tag).length} operations`,
  ]);
  output.print(
    `${chalk.bold('Inferred OpenAPI tags')}\n\n${renderSectionRows(rows)}\n`
  );
  return 0;
}

function printTagOperationsOverview(
  tag: ResolvedTagConfig,
  columns: number
): number {
  const operations = getTagOperations(tag);
  const subcommands: Command[] = operations.map(operation => ({
    name: operation.value,
    aliases:
      operation.value === operation.operationId ? [] : [operation.operationId],
    description: `OpenAPI operationId: ${operation.operationId}`,
    arguments: operation.arguments,
    options: [],
    examples: [],
  }));

  const command: Command = {
    name: tag.name,
    aliases: [
      tag.key,
      ...tag.aliases.filter(alias => alias !== tag.key && alias !== tag.name),
    ].filter(alias => alias !== tag.name),
    description: `Inferred OpenAPI operations for "${tag.name}"`,
    arguments: [],
    subcommands,
    options: [],
    examples: [],
  };

  output.print(renderHelp(command, { columns }));
  return 0;
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
    const implicitTeamValue =
      definition.source.location === 'query' &&
      definition.source.name === 'teamId'
        ? context.team?.value
        : undefined;
    const value =
      providedValue ??
      (definition.config.required === 'project'
        ? context.project?.id
        : definition.config.required === 'team'
          ? context.team?.value
          : implicitTeamValue);

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
    return 'Required';
  }
  if (required === 'project') {
    return 'Required if project context is missing';
  }
  if (required === 'team') {
    return 'Required if team context is missing';
  }
  return 'Optional';
}

function toHelpOption(
  name: string,
  config: InferredCommandParamConfig
): CommandOption {
  const descriptionParts = [getRequiredHint(config.required)];

  return {
    name,
    shorthand: null,
    type: String,
    deprecated: false,
    description: descriptionParts.join(' '),
  };
}

function buildHelpOptions(
  normalizedOptions: Record<string, InferredCommandParamConfig>
): CommandOption[] {
  return Object.entries(normalizedOptions).map(([name, config]) =>
    toHelpOption(name, config)
  );
}

function printInferredCommandHelp(
  resolved: ResolvedInferredCommand,
  cliArgs: string[],
  metadata: InferredOperationMetadata | null,
  columns: number
): number {
  const commandName =
    cliArgs[1] ?? getCommandValue(resolved.operationId, resolved.config);
  const normalizedArguments =
    normalizeParamConfigs(resolved.config.arguments, 'arguments') ?? {};
  const normalizedOptions =
    normalizeParamConfigs(resolved.config.options, 'options') ?? {};
  const aliases = Array.from(
    new Set([resolved.operationId, resolved.config.value].filter(Boolean))
  ).filter(name => name !== commandName) as string[];

  const command: Command = {
    name: commandName,
    aliases,
    description:
      metadata?.summary ||
      metadata?.description ||
      `Inferred OpenAPI command for operation "${resolved.operationId}".`,
    arguments: Object.entries(normalizedArguments).map(([name, config]) => ({
      name,
      required: config.required === true,
    })),
    options: buildHelpOptions(normalizedOptions),
    examples: resolved.config.examples ?? [],
  };

  const parent: Command = {
    name: resolved.tagName,
    aliases: resolved.tagAliases.filter(alias => alias !== resolved.tagName),
    description: `OpenAPI tag "${resolved.tagName}"`,
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
  const [tagToken, operationToken] = cliArgs;
  if (!tagToken || !operationToken) {
    return null;
  }

  const tag = resolveTagConfig(commands, tagToken);
  if (!tag) {
    return null;
  }

  const directMatch = tag.operations[operationToken];
  if (directMatch) {
    return {
      tag: tag.key,
      tagName: tag.name,
      tagAliases: [tag.key, ...tag.aliases].filter(alias => alias !== tag.name),
      operationId: operationToken,
      config: directMatch,
    };
  }

  for (const [operationId, config] of Object.entries(tag.operations)) {
    if (!config) {
      continue;
    }

    if (getCommandValue(operationId, config) === operationToken) {
      return {
        tag: tag.key,
        tagName: tag.name,
        tagAliases: [tag.key, ...tag.aliases].filter(
          alias => alias !== tag.name
        ),
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
  const helpRequested =
    options.help === true ||
    cliArgs.includes('-h') ||
    cliArgs.includes('--help');
  const commandArgs = stripHelpTokens(cliArgs);
  const [tagToken, operationToken] = commandArgs;

  if (options.execute === false && !helpRequested) {
    return null;
  }

  if (!tagToken) {
    if (helpRequested) {
      return printTagsOverview(commands);
    }
    return null;
  }

  const resolvedTag = resolveTagConfig(commands, tagToken);
  const operationsForTag = resolvedTag ? getTagOperations(resolvedTag) : [];
  if (!operationToken) {
    if (resolvedTag && operationsForTag.length > 0) {
      return printTagOperationsOverview(resolvedTag, options.columns ?? 80);
    }
    if (helpRequested) {
      return printTagsOverview(commands);
    }
    return null;
  }

  const resolved = resolveInferredCommand(commands, commandArgs);
  if (!resolved) {
    if (helpRequested && resolvedTag && operationsForTag.length > 0) {
      return printTagOperationsOverview(resolvedTag, options.columns ?? 80);
    }
    return null;
  }

  const metadata = await getInferredOperationMetadata(
    resolved.tag,
    resolved.operationId
  );

  if (helpRequested) {
    return printInferredCommandHelp(
      resolved,
      commandArgs,
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
  const parsedInput = parseProvidedCliInput(commandArgs.slice(2));
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
  if (options.dryRun === true) {
    parsedOptions['dry-run'] = true;
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
    if (!knownOptionNames.has(name) && name !== 'dry-run') {
      acc[name] = value;
    }
    return acc;
  }, {});

  const context = await resolveInferredContext(
    typeof parsedOptions.cwd === 'string' ? parsedOptions.cwd : undefined,
    typeof parsedOptions.scope === 'string' ? parsedOptions.scope : undefined,
    typeof parsedOptions.team === 'string' ? parsedOptions.team : undefined,
    options.client
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

  const dryRunFlag = parsedOptions['dry-run'];
  const isDryRun =
    options.dryRun === true ||
    dryRunFlag === true ||
    dryRunFlag === 'true' ||
    dryRunFlag === '';

  if (isDryRun) {
    printDryRunPreview({
      tag: resolved.tag,
      operationId: resolved.operationId,
      matchedValue:
        resolved.operationId === commandArgs[1]
          ? null
          : (commandArgs[1] ?? null),
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
    });
    return 0;
  }

  if (options.client) {
    return executeInferredRequest(options.client, request, parsedOptions);
  }

  output.print(
    JSON.stringify(
      {
        tag: resolved.tag,
        operationId: resolved.operationId,
        value: getCommandValue(resolved.operationId, resolved.config),
        matchedValue:
          resolved.operationId === commandArgs[1]
            ? null
            : (commandArgs[1] ?? null),
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
