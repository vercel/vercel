import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { JSONObject, JSONValue } from '@vercel-internals/types';
import type { BodyField, EndpointInfo, Parameter } from '../../util/openapi';
import { parseCliKeyValueField, readStdin } from './request-builder';
import type { ParsedFlags, RequestConfig } from './types';

/** Query params usually supplied by `vercel` scope / team context */
export const GLOBAL_CLI_QUERY_PARAMS = new Set(['teamId', 'slug']);

/**
 * Maps OpenAPI parameter names to CLI context sources.
 * These params can be auto-filled when the user hasn't provided them explicitly.
 */
export const CONTEXT_PARAM_MAP: Record<string, 'scope' | 'projectId'> = {
  teamId: 'scope',
  projectId: 'projectId',
  projectIdOrName: 'projectId',
};

/** Tags where an `idOrName` path param refers to a project (not another resource type) */
export const PROJECT_IDORNAME_TAGS = new Set([
  'projects',
  'projectMembers',
  'environment',
  'rolling-release',
  'connect',
  'static-ips',
]);

export type CliContext = {
  scope?: string;
  projectId?: string;
};

export type ParsedOperationInputs = {
  pathValues: Record<string, string>;
  queryValues: Record<string, string>;
  headerValues: Record<string, string>;
  body: JSONObject;
};

/**
 * Apply `-F`, `-f`, and positional `key=value` pairs for a resolved operation.
 */
export async function parseOperationKeyValuePairs(
  endpoint: EndpointInfo,
  bodyFields: BodyField[],
  flags: ParsedFlags,
  positionalKeyValues: string[]
): Promise<ParsedOperationInputs> {
  const pathParamNames = new Set(
    endpoint.parameters.filter(p => p.in === 'path').map(p => p.name)
  );
  const queryParamNames = new Set(
    endpoint.parameters.filter(p => p.in === 'query').map(p => p.name)
  );
  const headerParamNames = new Set(
    endpoint.parameters.filter(p => p.in === 'header').map(p => p.name)
  );
  const bodyFieldNames = new Set(bodyFields.map(f => f.name));

  const pathValues: Record<string, string> = {};
  const queryValues: Record<string, string> = {};
  const headerValues: Record<string, string> = {};
  const body: JSONObject = {};

  const requiredPathParams = endpoint.parameters
    .filter(p => p.in === 'path' && p.required !== false)
    .map(p => p.name);

  async function dispatchPair(field: string, typed: boolean) {
    const eqIndex = field.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(
        `Invalid option "${field}". Expected key=value (or use flags -F / -f).`
      );
    }
    const key = field.slice(0, eqIndex);
    const param = endpoint.parameters.find(p => p.name === key);

    if (param?.in === 'path') {
      const { value } = await parseCliKeyValueField(field, false);
      pathValues[key] = String(value);
      return;
    }
    if (param?.in === 'query') {
      const { value } = await parseCliKeyValueField(field, typed);
      queryValues[key] =
        typeof value === 'object' && value !== null
          ? JSON.stringify(value)
          : String(value);
      return;
    }
    if (param?.in === 'header') {
      const { value } = await parseCliKeyValueField(field, false);
      headerValues[key] = String(value);
      return;
    }
    if (param?.in === 'cookie') {
      throw new Error(
        `Option "${key}" is cookie-based; set it via headers instead.`
      );
    }

    if (bodyFieldNames.has(key)) {
      const { value } = await parseCliKeyValueField(field, typed);
      body[key] = value as JSONValue;
      return;
    }

    if (!param && pathParamNames.has(key)) {
      const { value } = await parseCliKeyValueField(field, false);
      pathValues[key] = String(value);
      return;
    }
    if (!param && queryParamNames.has(key)) {
      const { value } = await parseCliKeyValueField(field, typed);
      queryValues[key] =
        typeof value === 'object' && value !== null
          ? JSON.stringify(value)
          : String(value);
      return;
    }
    if (!param && headerParamNames.has(key)) {
      const { value } = await parseCliKeyValueField(field, false);
      headerValues[key] = String(value);
      return;
    }

    throw new Error(
      `Unknown option "${key}" for operation ${endpoint.operationId}. Check the API docs or run \`vercel api ls --format json\`.`
    );
  }

  function assignBarePositional(value: string): void {
    const nextPathParam = requiredPathParams.find(
      name => pathValues[name] === undefined
    );
    if (nextPathParam) {
      pathValues[nextPathParam] = value;
      return;
    }
    throw new Error(
      `Unexpected positional argument "${value}" for operation ${endpoint.operationId}. All path parameters are already set. Use key=value syntax for query/body fields.`
    );
  }

  for (const field of flags['--field'] || []) {
    await dispatchPair(field, true);
  }
  for (const field of flags['--raw-field'] || []) {
    await dispatchPair(field, false);
  }
  for (const field of positionalKeyValues) {
    if (field.indexOf('=') === -1) {
      assignBarePositional(field);
    } else {
      await dispatchPair(field, true);
    }
  }

  return { pathValues, queryValues, headerValues, body };
}

export function getMissingRequiredOperationParams(
  endpoint: EndpointInfo,
  bodyFields: BodyField[],
  parsed: ParsedOperationInputs,
  flags: ParsedFlags
): {
  path: Parameter[];
  query: Parameter[];
  header: Parameter[];
  body: BodyField[];
} {
  const pathParams = endpoint.parameters.filter(p => p.in === 'path');
  const missingPath = pathParams.filter(
    p => parsed.pathValues[p.name] === undefined
  );

  const requiredQuery = endpoint.parameters.filter(
    p => p.in === 'query' && p.required && !GLOBAL_CLI_QUERY_PARAMS.has(p.name)
  );
  const missingQuery = requiredQuery.filter(
    p => parsed.queryValues[p.name] === undefined
  );

  const requiredHeader = endpoint.parameters.filter(
    p => p.in === 'header' && p.required
  );
  const missingHeader = requiredHeader.filter(
    p => parsed.headerValues[p.name] === undefined
  );

  const missingBody = bodyFields.filter(
    f => f.required && parsed.body[f.name] === undefined && !flags['--input']
  );

  return {
    path: missingPath,
    query: missingQuery,
    header: missingHeader,
    body: missingBody,
  };
}

/**
 * Optional query/header/body inputs not yet provided, for interactive prompts.
 * Includes optional parameters and scope query params (`teamId`, `slug`) that are
 * omitted from {@link getMissingRequiredOperationParams}.
 */
export function getUnsetOptionalOperationParams(
  endpoint: EndpointInfo,
  bodyFields: BodyField[],
  parsed: ParsedOperationInputs,
  flags: ParsedFlags
): {
  query: Parameter[];
  header: Parameter[];
  body: BodyField[];
} {
  const unsetQuery = endpoint.parameters.filter(
    p =>
      p.in === 'query' &&
      parsed.queryValues[p.name] === undefined &&
      (!p.required || GLOBAL_CLI_QUERY_PARAMS.has(p.name))
  );

  const unsetHeader = endpoint.parameters.filter(
    p =>
      p.in === 'header' &&
      !p.required &&
      parsed.headerValues[p.name] === undefined
  );

  const unsetBody = bodyFields.filter(
    f => !f.required && parsed.body[f.name] === undefined && !flags['--input']
  );

  return {
    query: unsetQuery,
    header: unsetHeader,
    body: unsetBody,
  };
}

/**
 * Fill missing path/query params from CLI context (scope, linked project).
 * Mutates `parsed.pathValues` and `parsed.queryValues` in place.
 * Returns the set of param names that were auto-filled (for scope sync).
 */
export function applyContextDefaults(
  endpoint: EndpointInfo,
  parsed: ParsedOperationInputs,
  context?: CliContext
): Set<string> {
  const filled = new Set<string>();
  if (!context) return filled;

  for (const param of endpoint.parameters) {
    const { name } = param;
    const target = param.in === 'path' ? parsed.pathValues : parsed.queryValues;

    if (param.in !== 'path' && param.in !== 'query') continue;
    if (target[name] !== undefined) continue;

    let contextSource = CONTEXT_PARAM_MAP[name];
    if (
      !contextSource &&
      name === 'idOrName' &&
      param.in === 'path' &&
      endpoint.tags.some(t => PROJECT_IDORNAME_TAGS.has(t))
    ) {
      contextSource = 'projectId';
    }
    if (!contextSource) continue;

    const value = context[contextSource];
    if (value) {
      target[name] = value;
      filled.add(name);
    }
  }

  return filled;
}

/**
 * Build a {@link RequestConfig} for a resolved OpenAPI operation, routing
 * key=value arguments to path, query, header, or JSON body based on the spec.
 */
export async function buildRequestForResolvedOperation(
  endpoint: EndpointInfo,
  bodyFields: BodyField[],
  flags: ParsedFlags,
  positionalKeyValues: string[],
  context?: CliContext
): Promise<RequestConfig> {
  const headers: Record<string, string> = {};

  const customHeaders = flags['--header'] || [];
  for (const header of customHeaders) {
    const colonIndex = header.indexOf(':');
    if (colonIndex > 0) {
      const key = header.substring(0, colonIndex).trim();
      const value = header.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
  }

  const method = (
    flags['--method']?.toUpperCase() || endpoint.method
  ).toUpperCase();

  const pathParamNames = new Set(
    endpoint.parameters.filter(p => p.in === 'path').map(p => p.name)
  );

  const parsed = await parseOperationKeyValuePairs(
    endpoint,
    bodyFields,
    flags,
    positionalKeyValues
  );

  applyContextDefaults(endpoint, parsed, context);

  const { pathValues, queryValues, headerValues, body } = parsed;

  for (const [k, v] of Object.entries(headerValues)) {
    headers[k] = v;
  }

  let urlPath = endpoint.path;
  for (const name of pathParamNames) {
    const value = pathValues[name];
    if (value === undefined) {
      throw new Error(
        `Missing required path option {${name}} for ${endpoint.operationId}.`
      );
    }
    urlPath = urlPath.replace(`{${name}}`, encodeURIComponent(value));
  }
  if (/\{[^}]+\}/.test(urlPath)) {
    throw new Error(
      `Unresolved path placeholders in ${urlPath}. Provide values for all path options.`
    );
  }

  const requiredQuery = endpoint.parameters.filter(
    p => p.in === 'query' && p.required && !GLOBAL_CLI_QUERY_PARAMS.has(p.name)
  );
  for (const p of requiredQuery) {
    if (queryValues[p.name] === undefined) {
      throw new Error(
        `Missing required query option "${p.name}" for ${endpoint.operationId}.`
      );
    }
  }

  const requiredHeader = endpoint.parameters.filter(
    h => h.in === 'header' && h.required
  );
  for (const h of requiredHeader) {
    if (headerValues[h.name] === undefined) {
      throw new Error(
        `Missing required header option "${h.name}" for ${endpoint.operationId}.`
      );
    }
  }

  const requiredBody = bodyFields.filter(f => f.required);
  for (const f of requiredBody) {
    if (body[f.name] === undefined && !flags['--input']) {
      throw new Error(
        `Missing required body option "${f.name}" for ${endpoint.operationId}.`
      );
    }
  }

  const queryString = new URLSearchParams(queryValues).toString();
  if (queryString) {
    urlPath += (urlPath.includes('?') ? '&' : '?') + queryString;
  }

  let finalBody: JSONObject | string | undefined =
    Object.keys(body).length > 0 ? body : undefined;

  if (flags['--input']) {
    const inputPath = flags['--input'];
    let inputBody: string | JSONObject;
    if (inputPath === '-') {
      inputBody = await readStdin();
    } else {
      inputBody = await readFile(resolve(inputPath), 'utf-8');
    }
    if (typeof inputBody === 'string') {
      try {
        finalBody = JSON.parse(inputBody) as JSONObject;
      } catch {
        finalBody = inputBody;
      }
    } else {
      finalBody = inputBody;
    }
  }

  if (method === 'GET' || method === 'HEAD') {
    finalBody = undefined;
  }

  return {
    url: urlPath,
    method,
    headers,
    body: finalBody,
  };
}
