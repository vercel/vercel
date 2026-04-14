import type { Response } from 'node-fetch';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { buildRequest, formatOutput } from './request-builder';
import output from '../../output-manager';
import { formatVercelCliTable } from '../../util/openapi/vercel-cli-table';
import type {
  ExecuteApiRequestOptions,
  ParsedFlags,
  RequestConfig,
} from './types';

/**
 * Shared HTTP execution for `vercel api` and `vercel openapi` (same flags and behavior).
 */
export async function executeApiRequest(
  client: Client,
  endpoint: string,
  flags: ParsedFlags,
  options?: ExecuteApiRequestOptions
): Promise<number> {
  let requestConfig: RequestConfig;
  try {
    requestConfig = await buildRequest(endpoint, flags);
  } catch (err) {
    printError(err);
    return 1;
  }

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

  if (flags['--paginate']) {
    return executePaginatedRequest(client, requestConfig, flags, options);
  }

  return executeSingleRequest(client, requestConfig, flags, options);
}

async function executeSingleRequest(
  client: Client,
  config: RequestConfig,
  flags: ParsedFlags,
  options?: ExecuteApiRequestOptions
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

    return handleResponse(client, response, flags, options);
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}

async function executePaginatedRequest(
  client: Client,
  config: RequestConfig,
  flags: ParsedFlags,
  options?: ExecuteApiRequestOptions
): Promise<number> {
  const results: unknown[] = [];

  try {
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
      const data = extractPaginatedData(page);
      results.push(...data);
    }

    return outputResults(client, results, flags, options);
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}

function extractPaginatedData(page: Record<string, unknown>): unknown[] {
  for (const [key, value] of Object.entries(page)) {
    if (key !== 'pagination' && Array.isArray(value)) {
      return value;
    }
  }

  const { pagination, ...rest } = page;
  void pagination;
  return [rest];
}

async function handleResponse(
  client: Client,
  response: Response,
  flags: ParsedFlags,
  options?: ExecuteApiRequestOptions
): Promise<number> {
  if (flags['--include']) {
    outputHeaders(client, response);
  }

  if (flags['--silent']) {
    return response.ok ? 0 : 1;
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const json = await response.json();

    if (flags['--verbose']) {
      output.debug(
        `Response status: ${response.status} ${response.statusText}`
      );
    }

    return outputResults(client, json, flags, options);
  }

  const text = await response.text();
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

function outputResults(
  client: Client,
  data: unknown,
  flags: ParsedFlags,
  options?: ExecuteApiRequestOptions
): number {
  if (
    options?.vercelCliTable &&
    !flags['--raw'] &&
    data !== null &&
    typeof data === 'object'
  ) {
    const tableStr = formatVercelCliTable(data, options.vercelCliTable);
    if (tableStr) {
      client.stdout.write(tableStr + '\n');
      return 0;
    }
  }

  const formatted = formatOutput(data, {
    raw: flags['--raw'],
  });

  client.stdout.write(formatted + '\n');
  return 0;
}
