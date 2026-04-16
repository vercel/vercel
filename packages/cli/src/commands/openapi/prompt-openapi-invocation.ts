import chalk from 'chalk';
import type Client from '../../util/client';
import {
  buildOpenapiInvocationUrlAfterPathSubstitution,
  extractBracePathParamNames,
  getOpenapiQueryOptionParameters,
  parameterNameToCliOptionFlag,
  parseOpenapiOptionFlagTokens,
  splitOpenapiInvocationPositionals,
  substitutePathTemplate,
} from '../../util/openapi/openapi-operation-cli';
import type { EndpointInfo } from '../../util/openapi/types';
import { formatDescription, formatPathParam } from '../api/format-utils';

/** Same as `promptForParameters` in `vercel api` — scope is handled by CLI flags. */
const GLOBAL_OPTIONAL_SCOPE_PARAMS = new Set(['teamId', 'slug']);

function createRequiredValidator(fieldName: string) {
  return (input: string) => {
    if (!input.trim()) {
      return `${fieldName} is required`;
    }
    return true;
  };
}

export interface OpenapiInvocationResult {
  url: string;
  /** Body fields derived from positional arguments via `x-vercel-cli.bodyArguments`. */
  bodyFields: Record<string, string>;
}

/**
 * Resolve OpenAPI invocation URL from argv; when stdin is a TTY, prompts for
 * missing required path segments and required query flags.
 *
 * Positionals after the operation ID are consumed in order: first for path
 * template placeholders, then for `x-vercel-cli.bodyArguments` fields.
 */
export async function composeOpenapiInvocationUrlWithPromptsIfNeeded(
  client: Client,
  endpoint: EndpointInfo,
  positionalArgs: string[]
): Promise<OpenapiInvocationResult | { error: string }> {
  const { pathValues, optionArgvTail } =
    splitOpenapiInvocationPositionals(positionalArgs);

  const pathNames = extractBracePathParamNames(endpoint.path);
  const bodyArgNames = endpoint.vercelCliBodyArguments ?? [];

  const pathVals = pathValues.slice(0, pathNames.length);
  const bodyPositionals = pathValues.slice(pathNames.length);

  if (pathVals.length < pathNames.length && client.stdin.isTTY) {
    for (let i = pathVals.length; i < pathNames.length; i++) {
      const name = pathNames[i];
      const param = endpoint.parameters.find(
        p => p.in === 'path' && p.name === name
      );
      const value = await client.input.text({
        message: `Enter value for ${formatPathParam(name)}${formatDescription(param?.description)}:`,
        validate: createRequiredValidator(name),
      });
      pathVals.push(value);
    }
  }

  const substituted = substitutePathTemplate(
    endpoint.path,
    pathNames,
    pathVals
  );
  if (substituted.error) {
    return { error: substituted.error };
  }

  const bodyFields: Record<string, string> = {};
  for (let i = 0; i < bodyArgNames.length && i < bodyPositionals.length; i++) {
    bodyFields[bodyArgNames[i]] = bodyPositionals[i];
  }

  if (client.stdin.isTTY) {
    for (let i = bodyPositionals.length; i < bodyArgNames.length; i++) {
      const name = bodyArgNames[i];
      bodyFields[name] = await client.input.text({
        message: `Enter value for ${chalk.cyan(name)}:`,
        validate: createRequiredValidator(name),
      });
    }
  }

  const extraPositionals = bodyPositionals.length - bodyArgNames.length;
  if (extraPositionals > 0) {
    const allExpected = [
      ...pathNames.map(n => `{${n}}`),
      ...bodyArgNames.map(n => `<${n}>`),
    ];
    return {
      error: `Too many positional arguments: expected ${allExpected.length} (${allExpected.join(', ')}), got ${pathNames.length + bodyPositionals.length}.`,
    };
  }

  const optionParams = getOpenapiQueryOptionParameters(endpoint);
  const parsed = parseOpenapiOptionFlagTokens(optionArgvTail, optionParams);
  if (parsed.error) {
    return { error: parsed.error };
  }

  const queryVals = { ...parsed.values };
  if (client.stdin.isTTY) {
    for (const param of optionParams) {
      if (param.in !== 'query' || !param.required) {
        continue;
      }
      if (GLOBAL_OPTIONAL_SCOPE_PARAMS.has(param.name)) {
        continue;
      }
      if (queryVals[param.name] !== undefined) {
        continue;
      }
      const flag = parameterNameToCliOptionFlag(param.name);
      queryVals[param.name] = await client.input.text({
        message: `Enter value for ${chalk.cyan(`--${flag}`)}${formatDescription(param.description)}:`,
        validate: createRequiredValidator(param.name),
      });
    }
  }

  const urlResult = buildOpenapiInvocationUrlAfterPathSubstitution(
    substituted.path,
    endpoint,
    queryVals
  );
  if ('error' in urlResult) {
    return urlResult;
  }
  return { url: urlResult.url, bodyFields };
}
