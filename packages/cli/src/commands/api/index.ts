import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { help } from '../help';
import { apiCommand, listSubcommand } from './command';
import { ApiTelemetryClient } from '../../util/telemetry/commands/api';
import { buildRequest, generateCurlCommand } from './request-builder';
import { executeApiRequest } from './execute';
import { OpenApiCache } from '../../util/openapi';
import { API_BASE_URL } from './constants';
import {
  colorizeMethod,
  colorizeMethodPadded,
  formatPathParam,
  formatTypeHint,
  formatDescription,
} from './format-utils';
import output from '../../output-manager';
import type {
  ParsedFlags,
  EndpointInfo,
  Parameter,
  BodyField,
  SelectedEndpoint,
  PromptResult,
} from './types';
import {
  runOpenapiCli,
  buildUnknownTagMessage,
} from '../openapi/run-openapi-cli';
import { OpenapiTelemetryClient } from '../../util/telemetry/commands/openapi';

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
  const typedFlags = flags as ParsedFlags & { '--describe'?: boolean };
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

    const secondArg = args[2];
    const openApiForList = new OpenApiCache();
    const listSpecLoaded = await openApiForList.loadWithSpinner(
      lsFlags['--refresh'] ?? false
    );
    if (!listSpecLoaded) {
      output.error('Could not load OpenAPI specification');
      return 1;
    }

    if (secondArg && openApiForList.findEndpointsByTag(secondArg).length > 0) {
      const openapiTelemetryClient = new OpenapiTelemetryClient({
        opts: { store: client.telemetryEventStore },
      });
      const mergedFlags = { ...typedFlags, ...lsFlags };
      return runOpenapiCli(
        client,
        { args, flags: mergedFlags as Record<string, unknown> },
        openapiTelemetryClient
      );
    }

    if (secondArg) {
      output.error(buildUnknownTagMessage(openApiForList, secondArg));
      return 1;
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

  if (!firstArg) {
    if (typedFlags['--describe']) {
      const openapiTelemetryClient = new OpenapiTelemetryClient({
        opts: { store: client.telemetryEventStore },
      });
      return runOpenapiCli(
        client,
        parsedArgs as { args: string[]; flags: Record<string, unknown> },
        openapiTelemetryClient
      );
    }

    // Interactive mode: prompt for endpoint selection
    if (client.stdin.isTTY) {
      const selected = await promptEndpointSelection(
        client,
        flags['--refresh'] ?? false
      );
      if (!selected) {
        return 1;
      }
      return executePathApiRequest(
        client,
        telemetryClient,
        selected.finalUrl,
        flags as ParsedFlags,
        selected.method,
        selected.bodyFields
      );
    }
    output.error('Endpoint is required. Usage: vercel api <endpoint>');
    return 1;
  }

  if (firstArg.startsWith('/')) {
    return executePathApiRequest(
      client,
      telemetryClient,
      firstArg,
      flags as ParsedFlags,
      undefined,
      []
    );
  }

  const openApiForTag = new OpenApiCache();
  const tagSpecLoaded = await openApiForTag.loadWithSpinner(
    typedFlags['--refresh'] ?? false
  );
  if (!tagSpecLoaded) {
    output.error('Could not load OpenAPI specification');
    return 1;
  }
  if (openApiForTag.findEndpointsByTag(firstArg).length > 0) {
    const openapiTelemetryClient = new OpenapiTelemetryClient({
      opts: { store: client.telemetryEventStore },
    });
    return runOpenapiCli(
      client,
      parsedArgs as { args: string[]; flags: Record<string, unknown> },
      openapiTelemetryClient
    );
  }

  output.error('Endpoint must start with /');
  return 1;
}

async function executePathApiRequest(
  client: Client,
  telemetryClient: ApiTelemetryClient,
  endpoint: string,
  flags: ParsedFlags,
  selectedMethod: string | undefined,
  selectedBodyFields: string[]
): Promise<number> {
  // Validate endpoint format and prevent SSRF
  if (!endpoint.startsWith('/')) {
    output.error('Endpoint must start with /');
    return 1;
  }

  try {
    const resolvedUrl = new URL(endpoint, API_BASE_URL);
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

  telemetryClient.trackCliArgumentEndpoint(endpoint);
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

  const finalFlags = { ...flags } as ParsedFlags;
  if (selectedMethod && !flags['--method']) {
    finalFlags['--method'] = selectedMethod;
  }

  if (selectedBodyFields.length > 0) {
    const existingFields = finalFlags['--field'] || [];
    finalFlags['--field'] = [...existingFields, ...selectedBodyFields];
  }

  if (flags['--generate'] === 'curl') {
    try {
      const requestConfig = await buildRequest(endpoint, finalFlags);
      const curlCmd = generateCurlCommand(
        requestConfig,
        'https://api.vercel.com'
      );
      output.log('');
      output.log('Replace <TOKEN> with your auth token:');
      output.log('');
      client.stdout.write(curlCmd + '\n');
      return 0;
    } catch (err) {
      printError(err);
      return 1;
    }
  }

  return executeApiRequest(client, endpoint, finalFlags);
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
