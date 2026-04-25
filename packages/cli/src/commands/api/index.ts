import chalk from 'chalk';
import type Client from '../../util/client';
import type { Response } from 'node-fetch';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { help } from '../help';
import { apiCommand, listSubcommand } from './command';
import { ApiTelemetryClient } from '../../util/telemetry/commands/api';
import {
  buildRequest,
  formatOutput,
  generateCurlCommand,
} from './request-builder';
import {
  buildRequestForResolvedOperation,
  getMissingRequiredOperationParams,
  getUnsetOptionalOperationParams,
  parseOperationKeyValuePairs,
  GLOBAL_CLI_QUERY_PARAMS,
} from './operation-request-builder';
import {
  OpenApiCache,
  resolveEndpointByTagAndOperationId,
  type ResolveByTagOperationResult,
} from '../../util/openapi';
import { API_BASE_URL } from './constants';
import {
  colorizeMethod,
  colorizeMethodPadded,
  formatPathParam,
  formatTypeHint,
  formatDescription,
} from './format-utils';
import output from '../../output-manager';
import { renderCard, renderTable, parseArrayColumns } from './display-columns';
import { packageName } from '../../util/pkg-name';
import type {
  ParsedFlags,
  EndpointInfo,
  Parameter,
  BodyField,
  SelectedEndpoint,
  PromptResult,
  RequestConfig,
} from './types';

export default async function api(client: Client): Promise<number> {
  const telemetryClient = new ApiTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  // Parse arguments with permissive mode to handle subcommand flags
  let parsedArgs;
  const flagsSpec = getFlagsSpecification(apiCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpec, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const needHelp = flags['--help'];

  // Check for 'ls' or 'list' subcommand first (before general --help)
  const firstArg = args[1];
  if (firstArg === 'ls' || firstArg === 'list') {
    // Re-parse with listSubcommand options to capture --format
    const lsFlagsSpec = getFlagsSpecification(listSubcommand.options);
    let lsParsedArgs;
    try {
      lsParsedArgs = parseArguments(client.argv.slice(2), lsFlagsSpec);
    } catch (err) {
      printError(err);
      return 1;
    }
    const lsFlags = lsParsedArgs.flags;

    // Handle 'api ls --help'
    if (lsFlags['--help']) {
      telemetryClient.trackCliFlagHelp('api', firstArg);
      output.print(
        help(listSubcommand, {
          parent: apiCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
    }

    telemetryClient.trackCliSubcommandList();
    if (lsFlags['--refresh']) telemetryClient.trackCliFlagRefresh(true);
    if (lsFlags['--format'])
      telemetryClient.trackCliOptionFormat(lsFlags['--format']);
    return listEndpoints(
      client,
      lsFlags['--refresh'] ?? false,
      lsFlags['--format'] ?? 'table'
    );
  }

  // Handle 'api --help' (no subcommand)
  if (needHelp) {
    telemetryClient.trackCliFlagHelp('api');
    output.print(help(apiCommand, { columns: client.stderr.columns }));
    return 2;
  }

  // Set dangerously-skip-permissions flag for DELETE confirmation handling
  if (flags['--dangerously-skip-permissions']) {
    client.dangerouslySkipPermissions = true;
  }

  let endpoint: string | undefined;
  let selectedMethod: string | undefined;
  let selectedBodyFields: string[] = [];

  if (!firstArg) {
    if (client.stdin.isTTY) {
      const selected = await promptEndpointSelection(
        client,
        flags['--refresh'] ?? false
      );
      if (!selected) {
        return 1;
      }
      endpoint = selected.finalUrl;
      selectedMethod = selected.method;
      selectedBodyFields = selected.bodyFields;
    } else {
      output.error('Endpoint is required. Usage: vercel api <endpoint>');
      return 1;
    }
  } else {
    endpoint = firstArg;
  }

  if (endpoint && !endpoint.startsWith('/')) {
    output.error(
      `Invalid arguments. Use an API path starting with /, or run \`${packageName} api\` interactively.`
    );
    return 1;
  }

  try {
    const resolvedUrl = new URL(endpoint!, API_BASE_URL);
    if (resolvedUrl.origin !== API_BASE_URL) {
      output.error(
        'Invalid endpoint: must be a Vercel API path, not an external URL'
      );
      return 1;
    }
  } catch {
    output.error('Invalid endpoint URL format');
    return 1;
  }

  const finalFlags = { ...flags } as ParsedFlags;
  if (selectedMethod && !flags['--method']) {
    finalFlags['--method'] = selectedMethod;
  }

  if (selectedBodyFields.length > 0) {
    const existingFields = finalFlags['--field'] || [];
    finalFlags['--field'] = [...existingFields, ...selectedBodyFields];
  }

  let requestConfig: RequestConfig;
  try {
    requestConfig = await buildRequest(endpoint!, finalFlags);
  } catch (err) {
    printError(err);
    return 1;
  }

  // Track telemetry (tag + operationId path uses {@link runTagOperation})
  telemetryClient.trackCliArgumentEndpoint(requestConfig.url);
  telemetryClient.trackCliArgumentOperationId(undefined);
  telemetryClient.trackCliOptionMethod(flags['--method']);
  telemetryClient.trackCliOptionHeader(flags['--header']);
  telemetryClient.trackCliOptionInput(flags['--input']);
  if (flags['--paginate']) telemetryClient.trackCliFlagPaginate(true);
  if (flags['--include']) telemetryClient.trackCliFlagInclude(true);
  if (flags['--silent']) telemetryClient.trackCliFlagSilent(true);
  if (flags['--verbose']) telemetryClient.trackCliFlagVerbose(true);
  if (flags['--raw']) telemetryClient.trackCliFlagRaw(true);
  if (flags['--refresh']) telemetryClient.trackCliFlagRefresh(true);
  if (flags['--generate'])
    telemetryClient.trackCliOptionGenerate(flags['--generate']);
  if (flags['--dangerously-skip-permissions'])
    telemetryClient.trackCliFlagDangerouslySkipPermissions(true);

  // If generate mode, build request config and output in requested format
  if (flags['--generate'] === 'curl') {
    const curlCmd = generateCurlCommand(
      requestConfig,
      'https://api.vercel.com'
    );
    output.log('');
    output.log('Replace <TOKEN> with your auth token:');
    output.log('');
    client.stdout.write(curlCmd + '\n');
    return 0;
  }

  return executeApiRequest(client, requestConfig, finalFlags);
}

export async function printOperationHelpForTagCommand(
  flags: ParsedFlags,
  tag: string,
  operationId: string
): Promise<number> {
  const openApi = new OpenApiCache();
  const loaded = await openApi.loadWithSpinner(flags['--refresh'] ?? false);
  if (!loaded) {
    output.error('Could not load API specification');
    return 1;
  }

  const allEndpoints = openApi.getEndpoints();
  const resolved = resolveEndpointByTagAndOperationId(
    allEndpoints,
    tag,
    operationId
  );

  if (!resolved.ok) {
    printTagOperationResolveError(resolved, allEndpoints);
    return 1;
  }

  const ep = resolved.endpoint;
  const bodyFields = openApi.getBodyFields(ep);
  printOperationHelpDetails(ep, bodyFields, tag);
  return 2;
}

function printOperationHelpDetails(
  ep: EndpointInfo,
  bodyFields: BodyField[],
  tag: string
): void {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold(ep.operationId || '(operation)'));
  const blurb = ep.summary?.trim() || ep.description?.trim();
  if (blurb) {
    lines.push('');
    lines.push(chalk.dim(blurb));
  }

  lines.push('');
  lines.push(chalk.bold('Options'));
  lines.push('');

  const pathParams = ep.parameters.filter(p => p.in === 'path');
  const orderedParams: Parameter[] = [
    ...pathParams,
    ...ep.parameters.filter(p => p.in === 'query'),
    ...ep.parameters.filter(p => p.in === 'header'),
    ...ep.parameters.filter(p => p.in === 'cookie'),
  ];

  for (const p of orderedParams) {
    const globalNote =
      p.in === 'query' && GLOBAL_CLI_QUERY_PARAMS.has(p.name)
        ? chalk.dim(' (often set via --scope)')
        : '';
    let reqLabel: string;
    if (p.in === 'query') {
      reqLabel =
        p.required && !GLOBAL_CLI_QUERY_PARAMS.has(p.name)
          ? chalk.red('required')
          : chalk.dim('optional');
    } else if (p.in === 'path') {
      reqLabel =
        p.required !== false ? chalk.red('required') : chalk.dim('optional');
    } else if (p.in === 'header') {
      reqLabel = p.required ? chalk.red('required') : chalk.dim('optional');
    } else {
      reqLabel = p.required ? chalk.red('required') : chalk.dim('optional');
    }
    lines.push(
      `  ${chalk.cyan(p.name)}  ${reqLabel}${globalNote}${formatDescription(p.description)}`
    );
  }

  for (const f of bodyFields) {
    const req = f.required ? chalk.red('required') : chalk.dim('optional');
    const typeHint = f.type ? ` ${formatTypeHint(f.type)}` : '';
    lines.push(
      `  ${chalk.cyan(f.name)}  ${req}${typeHint}${formatDescription(f.description)}`
    );
  }

  if (orderedParams.length === 0 && bodyFields.length === 0) {
    lines.push(chalk.dim('  (none)'));
  }

  lines.push('');

  lines.push(chalk.bold('Example'));
  const exampleSuffix =
    pathParams.length > 0
      ? ` ${pathParams.map(p => `${p.name}=<value>`).join(' ')}`
      : '';
  lines.push(
    chalk.dim(`  ${packageName} api ${tag} ${ep.operationId}${exampleSuffix}`)
  );
  lines.push('');

  output.print(lines.join('\n'));
}

/**
 * Print operations for a tag when the user runs `vercel api <tag>` with no operationId.
 */
type MissingOperationBundle = ReturnType<
  typeof getMissingRequiredOperationParams
>;

function printMissingOperationParamsHelp(
  endpoint: EndpointInfo,
  missing: MissingOperationBundle
): void {
  output.error(
    `Missing required options for operation ${chalk.bold(endpoint.operationId)}.`
  );
  output.log(
    chalk.dim(
      `Pass each as key=value after the operationId, or use -F key=value. Example: \`${packageName} api ${endpoint.tags[0] ?? 'tag'} ${endpoint.operationId} idOrName=my-project\``
    )
  );
  output.log('');
  output.log(chalk.bold('Options'));
  output.log('');

  for (const p of missing.path) {
    output.log(`  ${chalk.cyan(p.name)}${formatDescription(p.description)}`);
  }
  for (const p of missing.header) {
    output.log(`  ${chalk.cyan(p.name)}${formatDescription(p.description)}`);
  }
  for (const p of missing.query) {
    output.log(`  ${chalk.cyan(p.name)}${formatDescription(p.description)}`);
  }
  for (const f of missing.body) {
    const typeHint = f.type ? ` ${formatTypeHint(f.type)}` : '';
    output.log(
      `  ${chalk.cyan(f.name)}${typeHint}${formatDescription(f.description)}`
    );
  }
  output.log('');
}

async function promptMissingParamsForTagOperation(
  client: Client,
  endpoint: EndpointInfo,
  bodyFields: BodyField[],
  flags: ParsedFlags,
  positionalKeyValues: string[]
): Promise<string[] | null> {
  const pos = [...positionalKeyValues];

  while (true) {
    const parsed = await (async () => {
      try {
        return await parseOperationKeyValuePairs(
          endpoint,
          bodyFields,
          flags,
          pos
        );
      } catch (err) {
        printError(err);
        return null;
      }
    })();

    if (parsed === null) {
      return null;
    }

    const missing = getMissingRequiredOperationParams(
      endpoint,
      bodyFields,
      parsed,
      flags
    );

    if (
      missing.path.length === 0 &&
      missing.query.length === 0 &&
      missing.header.length === 0 &&
      missing.body.length === 0
    ) {
      break;
    }

    for (const param of missing.path) {
      const value = await client.input.text({
        message: `Enter value for ${formatPathParam(param.name)}${formatDescription(param.description)}:`,
        validate: createRequiredValidator(param.name),
      });
      pos.push(`${param.name}=${value}`);
    }

    for (const param of missing.header) {
      const value = await client.input.text({
        message: `Enter value for header ${chalk.cyan(param.name)}${formatDescription(param.description)}:`,
        validate: createRequiredValidator(param.name),
      });
      pos.push(`${param.name}=${value}`);
    }

    for (const param of missing.query) {
      const value = await client.input.text({
        message: `Enter value for ${chalk.cyan(param.name)}${formatDescription(param.description)}:`,
        validate: createRequiredValidator(param.name),
      });
      pos.push(`${param.name}=${value}`);
    }

    for (const field of missing.body) {
      const value = await promptForBodyField(client, field, true);
      pos.push(`${field.name}=${value}`);
    }
  }

  return promptUnsetOptionalParamsForTagOperation(
    client,
    endpoint,
    bodyFields,
    flags,
    pos
  );
}

async function promptUnsetOptionalParamsForTagOperation(
  client: Client,
  endpoint: EndpointInfo,
  bodyFields: BodyField[],
  flags: ParsedFlags,
  positionalKeyValues: string[]
): Promise<string[] | null> {
  const pos = [...positionalKeyValues];

  const parsed = await (async () => {
    try {
      return await parseOperationKeyValuePairs(
        endpoint,
        bodyFields,
        flags,
        pos
      );
    } catch (err) {
      printError(err);
      return null;
    }
  })();

  if (parsed === null) {
    return null;
  }

  const unset = getUnsetOptionalOperationParams(
    endpoint,
    bodyFields,
    parsed,
    flags
  );

  if (
    unset.query.length === 0 &&
    unset.header.length === 0 &&
    unset.body.length === 0
  ) {
    return pos;
  }

  if (unset.query.length > 0) {
    const selected = await client.input.checkbox<string>({
      message: 'Select optional query parameters to include:',
      pageSize: 20,
      choices: unset.query.map(p => ({
        name: `${chalk.cyan(p.name)}${
          GLOBAL_CLI_QUERY_PARAMS.has(p.name)
            ? chalk.dim(' (team / scope; omit to use CLI default)')
            : ''
        }${formatDescription(p.description)}`,
        value: p.name,
      })),
    });

    for (const paramName of selected) {
      const param = unset.query.find(p => p.name === paramName)!;
      const value = await client.input.text({
        message: `Enter value for ${chalk.cyan(param.name)}${formatDescription(param.description)}:`,
        validate: createRequiredValidator(param.name),
      });
      pos.push(`${param.name}=${value}`);
    }
  }

  if (unset.header.length > 0) {
    const selected = await client.input.checkbox<string>({
      message: 'Select optional header parameters to include:',
      pageSize: 20,
      choices: unset.header.map(p => ({
        name: `${chalk.cyan(p.name)}${formatDescription(p.description)}`,
        value: p.name,
      })),
    });

    for (const paramName of selected) {
      const param = unset.header.find(p => p.name === paramName)!;
      const value = await client.input.text({
        message: `Enter value for header ${chalk.cyan(param.name)}${formatDescription(param.description)}:`,
        validate: createRequiredValidator(param.name),
      });
      pos.push(`${param.name}=${value}`);
    }
  }

  if (unset.body.length > 0) {
    const selected = await client.input.checkbox<string>({
      message: 'Select optional body fields to include:',
      pageSize: 20,
      choices: unset.body.map(f => ({
        name: `${chalk.cyan(f.name)}${f.type ? ` ${formatTypeHint(f.type)}` : ''}${formatDescription(f.description)}`,
        value: f.name,
      })),
    });

    for (const fieldName of selected) {
      const field = unset.body.find(f => f.name === fieldName)!;
      const value = await promptForBodyField(client, field, true);
      pos.push(`${field.name}=${value}`);
    }
  }

  return pos;
}

function printTagOperationResolveError(
  result: Extract<ResolveByTagOperationResult, { ok: false }>,
  allEndpoints: EndpointInfo[]
): void {
  if (result.reason === 'no_tag') {
    const tags = [...new Set(allEndpoints.flatMap(ep => ep.tags || []))].sort();
    const preview = tags.slice(0, 25).join(', ');
    output.error(
      `No operations use tag "${result.tag}".${tags.length > 0 ? ` Example tags: ${preview}${tags.length > 25 ? ', …' : ''}.` : ''} Run \`vercel api ls --format json\` to inspect tags.`
    );
    return;
  }

  if (result.reason === 'no_operation') {
    const ids = result.tagMatches
      .map(ep => ep.operationId)
      .filter(Boolean)
      .sort();
    output.error(
      `No operation matches "${result.operationHint}" under tag "${result.tag}".${ids.length > 0 ? ` Operations include: ${ids.slice(0, 20).join(', ')}${ids.length > 20 ? ', …' : ''}.` : ''}`
    );
    return;
  }

  const lines = result.tagMatches.map(
    ep => `  ${ep.operationId}  ${ep.method} ${ep.path}`
  );
  output.error(
    `Multiple operations match "${result.operationHint}" under tag "${result.tag}":\n${lines.join('\n')}`
  );
}

async function executeApiRequest(
  client: Client,
  requestConfig: RequestConfig,
  flags: ParsedFlags,
  displayColumns?: Record<string, string> | null,
  options?: { tagOperation?: boolean }
): Promise<number> {
  // Verbose mode: show request details
  if (flags['--verbose']) {
    output.debug(`Request: ${requestConfig.method} ${requestConfig.url}`);
    if (Object.keys(requestConfig.headers).length > 0) {
      output.debug(`Headers: ${JSON.stringify(requestConfig.headers)}`);
    }
    if (requestConfig.body) {
      output.debug(
        `Body: ${typeof requestConfig.body === 'string' ? requestConfig.body : JSON.stringify(requestConfig.body)}`
      );
    }
  }

  // Execute request (handles pagination if needed)
  if (flags['--paginate']) {
    return executePaginatedRequest(client, requestConfig, flags);
  }

  return executeSingleRequest(
    client,
    requestConfig,
    flags,
    displayColumns,
    options
  );
}

async function executeSingleRequest(
  client: Client,
  config: RequestConfig,
  flags: ParsedFlags,
  displayColumns?: Record<string, string> | null,
  options?: { tagOperation?: boolean }
): Promise<number> {
  try {
    const confirmed = await client.confirmMutatingOperation(
      config.url,
      config.method
    );
    if (!confirmed) {
      return 1;
    }

    const response: Response = await client.fetch(config.url, {
      method: config.method,
      body: config.body,
      headers: config.headers,
      json: false,
    });

    return handleResponse(
      client,
      response,
      flags,
      config.method,
      displayColumns,
      options
    );
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}

async function executePaginatedRequest(
  client: Client,
  config: RequestConfig,
  flags: ParsedFlags
): Promise<number> {
  const results: unknown[] = [];

  try {
    // Check for confirmation before proceeding with DELETE operations
    const confirmed = await client.confirmMutatingOperation(
      config.url,
      config.method
    );
    if (!confirmed) {
      return 1;
    }

    for await (const page of client.fetchPaginated<Record<string, unknown>>(
      config.url,
      {
        method: config.method,
        body: config.body,
        headers: config.headers,
      }
    )) {
      // Extract array data from response
      const data = extractPaginatedData(page);
      results.push(...data);
    }

    // Output combined results
    return outputResults(client, results, flags);
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}

/**
 * Extract array data from a paginated response
 * Vercel API returns data in various keys like 'deployments', 'projects', 'domains', etc.
 */
function extractPaginatedData(page: Record<string, unknown>): unknown[] {
  // Find the first array value in the response (skip pagination metadata)
  for (const [key, value] of Object.entries(page)) {
    if (key !== 'pagination' && Array.isArray(value)) {
      return value;
    }
  }

  // If no array found, return the page without pagination as a single item
  const { pagination, ...rest } = page;
  void pagination; // Explicitly ignore pagination
  return [rest];
}

async function handleResponse(
  client: Client,
  response: Response,
  flags: ParsedFlags,
  method: string,
  displayColumns?: Record<string, string> | null,
  options?: { tagOperation?: boolean }
): Promise<number> {
  if (flags['--include']) {
    outputHeaders(client, response);
  }

  if (flags['--silent']) {
    return response.ok ? 0 : 1;
  }

  const contentType = response.headers.get('content-type') || '';
  const isMutation = options?.tagOperation && method !== 'GET';

  if (contentType.includes('application/json')) {
    const json = await response.json();

    if (flags['--verbose']) {
      output.debug(
        `Response status: ${response.status} ${response.statusText}`
      );
    }

    if (displayColumns && response.ok && !flags['--raw']) {
      return outputWithDisplayColumns(client, json, displayColumns);
    }

    if (isMutation && !flags['--raw']) {
      if (!response.ok) {
        return outputMutationResult(client, response, method, json);
      }
      return outputMutationResult(client, response, method);
    }

    return outputResults(client, json, flags);
  }

  const text = await response.text();

  if (isMutation && !flags['--raw']) {
    return outputMutationResult(
      client,
      response,
      method,
      response.ok ? undefined : text
    );
  }

  client.stdout.write(text);

  return response.ok ? 0 : 1;
}

function outputHeaders(client: Client, response: Response): void {
  client.stdout.write(`HTTP ${response.status} ${response.statusText}\n`);
  response.headers.forEach((value, key) => {
    client.stdout.write(`${key}: ${value}\n`);
  });
  client.stdout.write('\n');
}

function outputWithDisplayColumns(
  client: Client,
  data: unknown,
  columns: Record<string, string>
): number {
  const parsed = parseArrayColumns(data, columns);
  if (parsed) {
    client.stdout.write(renderTable(parsed.rows, parsed.rowColumns) + '\n');
    return 0;
  }

  if (Array.isArray(data)) {
    client.stdout.write(renderTable(data, columns) + '\n');
  } else if (data && typeof data === 'object') {
    client.stdout.write(renderCard(data, columns) + '\n');
  } else {
    client.stdout.write(formatOutput(data, {}) + '\n');
  }
  return 0;
}

function outputMutationResult(
  client: Client,
  response: Response,
  method: string,
  errorBody?: unknown
): number {
  const verb =
    method === 'POST'
      ? 'Created'
      : method === 'PATCH' || method === 'PUT'
        ? 'Updated'
        : method === 'DELETE'
          ? 'Deleted'
          : 'Done';

  if (response.ok) {
    client.stdout.write(
      `${chalk.green('Success')}  ${verb} ${chalk.dim(`(${response.status})`)}\n`
    );
    return 0;
  }

  const errorMessage = extractErrorMessage(errorBody);
  const statusLine = `${chalk.red('Error')}  ${response.status} ${response.statusText}`;
  client.stdout.write(
    errorMessage
      ? `${statusLine}\n${chalk.dim(errorMessage)}\n`
      : `${statusLine}\n`
  );
  return 1;
}

function extractErrorMessage(body: unknown): string | null {
  if (!body) return null;
  if (typeof body === 'string') return body;
  if (typeof body === 'object' && body !== null) {
    const obj = body as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    const err = obj.error as Record<string, unknown> | undefined;
    if (err && typeof err.message === 'string') return err.message;
  }
  return null;
}

function outputResults(
  client: Client,
  data: unknown,
  flags: ParsedFlags
): number {
  const formatted = formatOutput(data, {
    raw: flags['--raw'],
  });

  client.stdout.write(formatted + '\n');
  return 0;
}

async function promptEndpointSelection(
  client: Client,
  forceRefresh: boolean
): Promise<SelectedEndpoint | null> {
  try {
    const openApi = new OpenApiCache();
    const success = await openApi.loadWithSpinner(forceRefresh);
    if (!success) {
      output.error('Could not load API specification for endpoint selection');
      return null;
    }

    const endpoints = openApi.getEndpoints();
    const selectedEndpoint = await promptForEndpoint(client, endpoints);

    // Get body fields from schema and prompt for required parameters
    const bodyFieldsSpec = openApi.getBodyFields(selectedEndpoint);
    const { finalUrl, bodyFields } = await promptForParameters(
      client,
      selectedEndpoint.path,
      selectedEndpoint.parameters,
      bodyFieldsSpec
    );

    return {
      path: selectedEndpoint.path,
      method: selectedEndpoint.method,
      finalUrl,
      bodyFields,
    };
  } catch (err) {
    output.stopSpinner();
    output.debug(`Endpoint selection failed: ${err}`);
    return null;
  }
}

/**
 * Interactive endpoint search prompt
 */
async function promptForEndpoint(
  client: Client,
  endpoints: EndpointInfo[]
): Promise<EndpointInfo> {
  const allChoices = endpoints.map(ep => ({
    name: `${colorizeMethodPadded(ep.method)} ${ep.path}`,
    value: ep,
    // Show full description if available, otherwise show summary
    description: ep.description || ep.summary || undefined,
    // Include summary in searchable metadata
    summary: ep.summary,
    tags: ep.tags,
  }));

  const total = allChoices.length;

  return client.input.search<EndpointInfo>({
    message: `Search for an API endpoint (${total} available):`,
    source: async (term: string | undefined) => {
      if (!term) {
        return allChoices;
      }

      const lowerTerm = term.toLowerCase();
      return allChoices.filter(choice => {
        const searchableText = [
          choice.name,
          choice.summary || '',
          choice.description || '',
          ...(choice.tags || []),
        ]
          .join(' ')
          .toLowerCase();
        return searchableText.includes(lowerTerm);
      });
    },
  });
}

/**
 * List all available API endpoints
 */
async function listEndpoints(
  client: Client,
  forceRefresh: boolean,
  format: string
): Promise<number> {
  const openApi = new OpenApiCache();
  const success = await openApi.loadWithSpinner(forceRefresh);
  if (!success) {
    output.error('Could not load API specification');
    return 1;
  }

  const endpoints = openApi.getEndpoints();

  if (format === 'json') {
    return outputEndpointsAsJson(client, endpoints);
  }

  return outputEndpointsAsTable(endpoints);
}

function outputEndpointsAsJson(
  client: Client,
  endpoints: EndpointInfo[]
): number {
  const jsonOutput = endpoints.map(ep => ({
    method: ep.method,
    path: ep.path,
    summary: ep.summary || null,
    description: ep.description || null,
    operationId: ep.operationId || null,
    tags: ep.tags,
  }));
  client.stdout.write(JSON.stringify(jsonOutput, null, 2) + '\n');
  return 0;
}

/**
 * Group endpoints by path
 */
interface GroupedEndpoint {
  method: string;
  summary?: string;
}

function groupEndpointsByPath(
  endpoints: EndpointInfo[]
): Map<string, GroupedEndpoint[]> {
  const grouped = new Map<string, GroupedEndpoint[]>();

  for (const ep of endpoints) {
    const existing = grouped.get(ep.path) || [];
    existing.push({ method: ep.method, summary: ep.summary });
    grouped.set(ep.path, existing);
  }

  // Sort methods within each group for consistent display
  const methodOrder = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  for (const [path, methods] of grouped) {
    methods.sort(
      (a, b) => methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method)
    );
    grouped.set(path, methods);
  }

  return grouped;
}

function outputEndpointsAsTable(endpoints: EndpointInfo[]): number {
  const grouped = groupEndpointsByPath(endpoints);
  const methodWidth = 7;

  output.log('');

  for (const [path, methods] of grouped) {
    // Print path as header
    output.log(chalk.bold(path));

    // Print each method underneath with indentation
    for (const { method, summary } of methods) {
      const coloredMethod = colorizeMethod(method);
      const paddedMethod = method.padEnd(methodWidth);
      const methodDisplay = coloredMethod + paddedMethod.slice(method.length);
      output.log(`  ${methodDisplay}  ${chalk.gray(summary || '')}`);
    }

    output.log(''); // Blank line between paths
  }

  output.log(
    `${chalk.bold(grouped.size.toString())} routes, ${chalk.bold(endpoints.length.toString())} endpoints`
  );
  return 0;
}

/**
 * Create a validator that requires non-empty input
 */
function createRequiredValidator(fieldName: string) {
  return (input: string) => {
    if (!input.trim()) {
      return `${fieldName} is required`;
    }
    return true;
  };
}

/**
 * Build URL query string from params object
 */
function buildQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * Prompt for required path parameters, query parameters, and body fields
 */
async function promptForParameters(
  client: Client,
  path: string,
  parameters: Parameter[],
  bodyFieldsSpec: BodyField[]
): Promise<PromptResult> {
  // Global query params handled by CLI infrastructure (--scope flag)
  const globalParams = new Set(['teamId', 'slug']);

  const pathParams = parameters.filter(p => p.in === 'path');
  const requiredQueryParams = parameters.filter(
    p => p.in === 'query' && p.required && !globalParams.has(p.name)
  );
  const optionalQueryParams = parameters.filter(
    p => p.in === 'query' && !p.required && !globalParams.has(p.name)
  );
  const requiredBodyFields = bodyFieldsSpec.filter(f => f.required);
  const optionalBodyFields = bodyFieldsSpec.filter(f => !f.required);

  // Collect path parameter values (always required)
  let finalPath = path;
  for (const param of pathParams) {
    const value = await client.input.text({
      message: `Enter value for ${formatPathParam(param.name)}${formatDescription(param.description)}:`,
      validate: createRequiredValidator(param.name),
    });
    finalPath = finalPath.replace(`{${param.name}}`, encodeURIComponent(value));
  }

  // Collect required query parameter values
  const queryValues: Record<string, string> = {};
  for (const param of requiredQueryParams) {
    queryValues[param.name] = await client.input.text({
      message: `Enter value for ${chalk.cyan(param.name)}${formatDescription(param.description)}:`,
      validate: createRequiredValidator(param.name),
    });
  }

  // Select which optional query parameters to provide
  if (optionalQueryParams.length > 0) {
    const selectedOptionalParams = await client.input.checkbox<string>({
      message: 'Select optional query parameters to include:',
      pageSize: 20,
      choices: optionalQueryParams.map(p => ({
        name: `${chalk.cyan(p.name)}${formatDescription(p.description)}`,
        value: p.name,
      })),
    });

    // Prompt for values of selected optional query params
    for (const paramName of selectedOptionalParams) {
      const param = optionalQueryParams.find(p => p.name === paramName)!;
      queryValues[param.name] = await client.input.text({
        message: `Enter value for ${chalk.cyan(param.name)}${formatDescription(param.description)}:`,
        validate: createRequiredValidator(param.name),
      });
    }
  }

  // Collect required body field values
  const bodyFieldValues: string[] = [];
  for (const field of requiredBodyFields) {
    const value = await promptForBodyField(client, field, true);
    bodyFieldValues.push(`${field.name}=${value}`);
  }

  // Select which optional body fields to provide
  if (optionalBodyFields.length > 0) {
    const selectedOptionalFields = await client.input.checkbox<string>({
      message: 'Select optional body fields to include:',
      pageSize: 20,
      choices: optionalBodyFields.map(f => ({
        name: `${chalk.cyan(f.name)}${f.type ? ` ${formatTypeHint(f.type)}` : ''}${formatDescription(f.description)}`,
        value: f.name,
      })),
    });

    // Prompt for values of selected optional body fields
    for (const fieldName of selectedOptionalFields) {
      const field = optionalBodyFields.find(f => f.name === fieldName)!;
      const value = await promptForBodyField(client, field, true);
      bodyFieldValues.push(`${field.name}=${value}`);
    }
  }

  // Build final URL with query string
  const queryString = buildQueryString(queryValues);
  if (queryString) {
    finalPath += `?${queryString}`;
  }

  return { finalUrl: finalPath, bodyFields: bodyFieldValues };
}

/**
 * Prompt for a single body field value (text input, enum select, or array multi-select)
 */
async function promptForBodyField(
  client: Client,
  field: BodyField,
  required: boolean
): Promise<string> {
  const description = formatDescription(field.description);
  const optionalHint = required ? '' : chalk.dim(' (optional)');

  // Use checkbox for array fields with enum values (multi-select)
  if (
    field.type === 'array' &&
    field.enumValues &&
    field.enumValues.length > 0
  ) {
    const choices = field.enumValues.map(v => ({
      name: String(v),
      value: String(v),
    }));

    const selected = await client.input.checkbox<string>({
      message: `Select values for ${chalk.cyan(field.name)}${optionalHint}${description}:`,
      choices,
      required,
    });

    // Return as JSON array for the --field flag
    return JSON.stringify(selected);
  }

  // Use select for non-array enum fields
  if (field.enumValues && field.enumValues.length > 0) {
    const choices = field.enumValues.map(v => ({
      name: String(v),
      value: String(v),
    }));

    // Add empty option for optional enum fields
    if (!required) {
      choices.unshift({ name: chalk.dim('(skip)'), value: '' });
    }

    return client.input.select({
      message: `Select value for ${chalk.cyan(field.name)}${optionalHint}${description}:`,
      choices,
    });
  }

  // Use text input for other fields
  const typeHint = field.type ? ` ${formatTypeHint(field.type)}` : '';
  return client.input.text({
    message: `Enter value for ${chalk.cyan(field.name)}${optionalHint}${typeHint}${description}:`,
    validate: required ? createRequiredValidator(field.name) : undefined,
  });
}

/**
 * Shared path for `vercel api <tag> <operationId> …` and for commands that delegate
 * (e.g. `project`) without mutating `process.argv`.
 */
export async function runTagOperation(
  client: Client,
  options: {
    tag: string;
    operationId: string;
    flags: ParsedFlags;
    positionalOperationFields: string[];
  }
): Promise<number> {
  const { tag, operationId, flags, positionalOperationFields } = options;
  const telemetryClient = new ApiTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const finalFlags = { ...flags } as ParsedFlags;

  const openApi = new OpenApiCache();
  const loaded = await openApi.loadWithSpinner(
    finalFlags['--refresh'] ?? false
  );
  if (!loaded) {
    output.error('Could not load API specification');
    return 1;
  }

  const allEndpoints = openApi.getEndpoints();
  const resolved = resolveEndpointByTagAndOperationId(
    allEndpoints,
    tag,
    operationId
  );

  if (!resolved.ok) {
    printTagOperationResolveError(resolved, allEndpoints);
    return 1;
  }

  const bodyFields = openApi.getBodyFields(resolved.endpoint);
  const displayColumns = openApi.getDisplayColumns(resolved.endpoint);
  let tagOperationPositional = positionalOperationFields;

  if (client.stdin.isTTY) {
    const prompted = await promptMissingParamsForTagOperation(
      client,
      resolved.endpoint,
      bodyFields,
      finalFlags,
      tagOperationPositional
    );
    if (prompted === null) {
      return 1;
    }
    tagOperationPositional = prompted;
  } else {
    try {
      const parsed = await parseOperationKeyValuePairs(
        resolved.endpoint,
        bodyFields,
        finalFlags,
        tagOperationPositional
      );
      const missing = getMissingRequiredOperationParams(
        resolved.endpoint,
        bodyFields,
        parsed,
        finalFlags
      );
      if (
        missing.path.length > 0 ||
        missing.query.length > 0 ||
        missing.header.length > 0 ||
        missing.body.length > 0
      ) {
        printMissingOperationParamsHelp(resolved.endpoint, missing);
        return 1;
      }
    } catch (err) {
      printError(err);
      return 1;
    }
  }

  let requestConfig: RequestConfig;
  try {
    requestConfig = await buildRequestForResolvedOperation(
      resolved.endpoint,
      bodyFields,
      finalFlags,
      tagOperationPositional
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  telemetryClient.trackCliArgumentEndpoint(tag);
  telemetryClient.trackCliArgumentOperationId(operationId);
  telemetryClient.trackCliOptionMethod(finalFlags['--method']);
  telemetryClient.trackCliOptionHeader(finalFlags['--header']);
  telemetryClient.trackCliOptionInput(finalFlags['--input']);
  if (finalFlags['--paginate']) telemetryClient.trackCliFlagPaginate(true);
  if (finalFlags['--include']) telemetryClient.trackCliFlagInclude(true);
  if (finalFlags['--silent']) telemetryClient.trackCliFlagSilent(true);
  if (finalFlags['--verbose']) telemetryClient.trackCliFlagVerbose(true);
  if (finalFlags['--raw']) telemetryClient.trackCliFlagRaw(true);
  if (finalFlags['--refresh']) telemetryClient.trackCliFlagRefresh(true);
  if (finalFlags['--generate'])
    telemetryClient.trackCliOptionGenerate(finalFlags['--generate']);
  if (finalFlags['--dangerously-skip-permissions'])
    telemetryClient.trackCliFlagDangerouslySkipPermissions(true);

  if (finalFlags['--generate'] === 'curl') {
    const curlCmd = generateCurlCommand(
      requestConfig,
      'https://api.vercel.com'
    );
    output.log('');
    output.log('Replace <TOKEN> with your auth token:');
    output.log('');
    client.stdout.write(curlCmd + '\n');
    return 0;
  }

  return executeApiRequest(client, requestConfig, finalFlags, displayColumns, {
    tagOperation: true,
  });
}
