import type { EndpointInfo, Parameter } from './types';
import { foldNamingStyle, operationIdToKebabCase } from './fold-naming-style';

/**
 * Path placeholders `{paramName}` in order of first appearance.
 */
export function extractBracePathParamNames(pathTemplate: string): string[] {
  const names: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pathTemplate)) !== null) {
    names.push(m[1]);
  }
  return names;
}

export function getParameterCliKind(param: Parameter): 'argument' | 'option' {
  const explicit = param['x-vercel-cli']?.kind;
  if (explicit === 'argument' || explicit === 'option') {
    return explicit;
  }
  if (param.in === 'path') {
    return 'argument';
  }
  return 'option';
}

/** CLI flag segment for an OpenAPI parameter name (e.g. `teamId` → `team-id`). */
export function parameterNameToCliOptionFlag(paramName: string): string {
  return operationIdToKebabCase(paramName);
}

function findParameterForFlagName(
  flagName: string,
  optionParams: Parameter[]
): Parameter | undefined {
  const fold = foldNamingStyle(flagName);
  return optionParams.find(p => {
    if (foldNamingStyle(p.name) === fold) {
      return true;
    }
    return parameterNameToCliOptionFlag(p.name) === flagName;
  });
}

function isBooleanParameter(param: Parameter): boolean {
  const t = param.schema?.type;
  if (t === 'boolean') {
    return true;
  }
  const en = param.schema?.enum;
  return (
    Array.isArray(en) && en.length > 0 && en.every(v => typeof v === 'boolean')
  );
}

function normalizeQueryValue(raw: string, param: Parameter): string {
  if (isBooleanParameter(param)) {
    const lower = raw.toLowerCase();
    if (lower === 'true' || lower === 'false') {
      return lower;
    }
  }
  return raw;
}

/**
 * Positional values after `<operationId>` (until the first `--…` token), and the
 * remainder for OpenAPI-driven `--option` parsing.
 *
 * `positionalArgs` is `parseArguments().args` where `[0]` is the subcommand (`openapi`).
 */
export function splitOpenapiInvocationPositionals(positionalArgs: string[]): {
  pathValues: string[];
  optionArgvTail: string[];
} {
  const afterOp = positionalArgs.slice(3);
  const pathValues: string[] = [];
  let i = 0;
  for (; i < afterOp.length; i++) {
    const t = afterOp[i];
    if (t.startsWith('-')) {
      break;
    }
    pathValues.push(t);
  }
  return { pathValues, optionArgvTail: afterOp.slice(i) };
}

/**
 * Parse `--name` / `--name=value` tokens for query (and header/cookie) parameters
 * that use CLI `kind: option`.
 */
export function parseOpenapiOptionFlagTokens(
  optionArgvTail: string[],
  optionParams: Parameter[]
): { values: Record<string, string>; error?: string } {
  const values: Record<string, string> = {};
  let i = 0;

  while (i < optionArgvTail.length) {
    const token = optionArgvTail[i];
    if (!token.startsWith('--')) {
      return {
        values,
        error: `Unexpected argument ${JSON.stringify(token)}. Place path arguments before any --options.`,
      };
    }

    const body = token.slice(2);
    const eq = body.indexOf('=');
    let flagName: string;
    let inlineValue: string | undefined;
    if (eq >= 0) {
      flagName = body.slice(0, eq);
      inlineValue = body.slice(eq + 1);
    } else {
      flagName = body;
    }

    const param = findParameterForFlagName(flagName, optionParams);
    if (!param) {
      return {
        values,
        error: `Unknown option --${flagName} for this operation.`,
      };
    }

    if (inlineValue !== undefined) {
      values[param.name] = normalizeQueryValue(inlineValue, param);
      i += 1;
      continue;
    }

    if (isBooleanParameter(param)) {
      values[param.name] = 'true';
      i += 1;
      continue;
    }

    const next = optionArgvTail[i + 1];
    if (next === undefined || next.startsWith('-')) {
      return {
        values,
        error: `Option --${parameterNameToCliOptionFlag(param.name)} requires a value.`,
      };
    }
    values[param.name] = normalizeQueryValue(next, param);
    i += 2;
  }

  return { values };
}

function buildQueryString(query: Record<string, string>): string {
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.join('&');
}

function substitutePathTemplate(
  pathTemplate: string,
  pathPlaceholderNames: string[],
  pathValues: string[]
): { path: string; error?: string } {
  if (pathPlaceholderNames.length !== pathValues.length) {
    const need = pathPlaceholderNames.length;
    const got = pathValues.length;
    const names = pathPlaceholderNames.map(n => `{${n}}`).join(', ');
    return {
      path: pathTemplate,
      error:
        need === 0
          ? `This operation takes no path arguments; remove the extra ${got} positional value(s).`
          : got < need
            ? `Missing path argument(s): expected ${need} (${names}), got ${got}.`
            : `Too many path arguments: expected ${need} (${names}), got ${got}.`,
    };
  }

  let out = pathTemplate;
  for (let i = 0; i < pathPlaceholderNames.length; i++) {
    const name = pathPlaceholderNames[i];
    const value = pathValues[i];
    const key = `{${name}}`;
    if (!out.includes(key)) {
      return {
        path: pathTemplate,
        error: `Path template does not contain placeholder ${key}.`,
      };
    }
    out = out.replace(key, encodeURIComponent(value));
  }
  if (/\{[^}]+\}/.test(out)) {
    return {
      path: out,
      error: 'Path still contains unresolved placeholders after substitution.',
    };
  }
  return { path: out };
}

/**
 * Parameters exposed as CLI options (not path positionals), e.g. `in: query` with
 * `kind: option` (the default for query params).
 */
export function getOpenapiOptionParameters(
  endpoint: EndpointInfo
): Parameter[] {
  return endpoint.parameters.filter(p => getParameterCliKind(p) === 'option');
}

/** Query parameters driven by `--kebab-name` flags for `vercel openapi`. */
export function getOpenapiQueryOptionParameters(
  endpoint: EndpointInfo
): Parameter[] {
  return getOpenapiOptionParameters(endpoint).filter(p => p.in === 'query');
}

/**
 * Build the request path (including `?query`) for `vercel openapi` from OpenAPI
 * metadata and argv positionals / `--option` tokens.
 */
export function resolveOpenapiInvocationUrl(input: {
  endpoint: EndpointInfo;
  /** `parseArguments().args` where `[0]` is `openapi` */
  positionalArgs: string[];
}): { url: string } | { error: string } {
  const { pathValues, optionArgvTail } = splitOpenapiInvocationPositionals(
    input.positionalArgs
  );

  const pathNames = extractBracePathParamNames(input.endpoint.path);
  const substituted = substitutePathTemplate(
    input.endpoint.path,
    pathNames,
    pathValues
  );
  if (substituted.error) {
    return { error: substituted.error };
  }

  const optionParams = getOpenapiQueryOptionParameters(input.endpoint);
  const parsed = parseOpenapiOptionFlagTokens(optionArgvTail, optionParams);
  if (parsed.error) {
    return { error: parsed.error };
  }

  for (const param of optionParams) {
    if (param.in !== 'query') {
      continue;
    }
    if (param.required && parsed.values[param.name] === undefined) {
      return {
        error: `Missing required option --${parameterNameToCliOptionFlag(param.name)}.`,
      };
    }
  }

  const query = buildQueryString(parsed.values);
  const url = query ? `${substituted.path}?${query}` : substituted.path;
  return { url };
}
