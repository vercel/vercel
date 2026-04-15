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

/**
 * Resolve OpenAPI invocation URL from argv; when stdin is a TTY, prompts for
 * missing required path segments and required query flags.
 */
export async function composeOpenapiInvocationUrlWithPromptsIfNeeded(
  client: Client,
  endpoint: EndpointInfo,
  positionalArgs: string[]
): Promise<{ url: string } | { error: string }> {
  const { pathValues, optionArgvTail } =
    splitOpenapiInvocationPositionals(positionalArgs);

  const pathNames = extractBracePathParamNames(endpoint.path);
  const pathVals = [...pathValues];

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

  return buildOpenapiInvocationUrlAfterPathSubstitution(
    substituted.path,
    endpoint,
    queryVals
  );
}
