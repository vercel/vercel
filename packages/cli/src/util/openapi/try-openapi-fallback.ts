import type Client from '../client';
import { parseArguments } from '../get-args';
import { getFlagsSpecification } from '../get-flags-specification';
import { apiCommand } from '../../commands/api/command';
import {
  runTagOperation,
  printOperationHelpForTagCommand,
} from '../../commands/api/index';
import type { ParsedFlags } from '../../commands/api/types';
import { OpenApiCache } from './openapi-cache';
import output from '../../output-manager';

/**
 * Try to delegate an unmatched subcommand token to the OpenAPI tag/operationId
 * flow. Intended to be called in the `default` branch of a command's switch
 * statement, before printing "invalid subcommand".
 *
 * @param client        – The CLI client.
 * @param cliArgs       – Tokens after the parent command (e.g. `['getProject', 'idOrName=foo']`).
 * @param resolveTag    – Async function that returns the OpenAPI tag to use
 *                        (e.g. `resolveOpenApiTagForProjectsCli`), or `null`
 *                        if no tag is available for this command.
 * @returns Exit code when delegation happened, or `null` if OpenAPI could not handle it.
 */
export async function tryOpenApiFallback(
  client: Client,
  cliArgs: string[],
  resolveTag: () => Promise<string | null>
): Promise<number | null> {
  if (!process.env.VERCEL_AUTO_API) {
    return null;
  }

  const operationHint = cliArgs[0];
  if (!operationHint || operationHint.startsWith('-')) {
    return null;
  }

  const tag = await resolveTag();
  if (!tag) {
    return null;
  }

  const apiFlagsSpec = getFlagsSpecification(apiCommand.options);
  let apiParsed: ReturnType<typeof parseArguments<typeof apiFlagsSpec>>;
  try {
    apiParsed = parseArguments(client.argv.slice(2), apiFlagsSpec, {
      permissive: true,
    });
  } catch {
    return null;
  }

  const flags = apiParsed.flags as ParsedFlags;
  if (flags['--dangerously-skip-permissions']) {
    client.dangerouslySkipPermissions = true;
  }

  if (flags['--help']) {
    return printOperationHelpForTagCommand(flags, tag, operationHint);
  }

  return runTagOperation(client, {
    tag,
    operationId: operationHint,
    flags,
    positionalOperationFields: cliArgs.slice(1),
  });
}

/**
 * CLI command name → candidate OpenAPI tag(s). Tried in order;
 * the first tag that exists in the spec wins.
 */
const COMMAND_TO_TAGS: Record<string, string[]> = {
  project: ['projects', 'project'],
  domains: ['domains'],
  dns: ['dns'],
  certs: ['certs'],
  env: ['environment', 'env'],
  list: ['deployments'],
  inspect: ['deployments'],
  alias: ['aliases', 'alias'],
  teams: ['teams'],
  tokens: ['tokens'],
};

/**
 * Check whether an OpenAPI operation with `supportedProduction: true` should
 * replace a native CLI command. Called from `index.ts` before the native
 * command handler runs.
 *
 * @param client       – The CLI client.
 * @param commandName  – The top-level CLI command (e.g. `project`, `domains`).
 * @param subArgs      – Tokens after `vercel <command>` (e.g. `['ls', '--scope', 'team']`).
 * @returns Exit code if the OpenAPI handler ran, or `null` to fall through to
 *          the native implementation.
 */
export async function tryOpenApiProductionOverride(
  client: Client,
  commandName: string,
  subArgs: string[]
): Promise<number | null> {
  const candidateTags = COMMAND_TO_TAGS[commandName];
  if (!candidateTags) {
    return null;
  }

  const subcommandHint = subArgs.find(a => !a.startsWith('-'));
  if (!subcommandHint) {
    return null;
  }

  const cache = new OpenApiCache(client);
  const loaded = await cache.load();
  if (!loaded) {
    return null;
  }

  let matchedTag: string | undefined;
  for (const tag of candidateTags) {
    const ep = cache.findProductionReadyByTagAndHint(tag, subcommandHint);
    if (ep) {
      matchedTag = tag;
      break;
    }
  }

  if (!matchedTag) {
    return null;
  }

  output.debug(
    `Production override: routing "vercel ${commandName} ${subcommandHint}" to OpenAPI tag "${matchedTag}"`
  );

  const apiFlagsSpec = getFlagsSpecification(apiCommand.options);
  let apiParsed: ReturnType<typeof parseArguments<typeof apiFlagsSpec>>;
  try {
    apiParsed = parseArguments(client.argv.slice(2), apiFlagsSpec, {
      permissive: true,
    });
  } catch {
    return null;
  }

  const flags = apiParsed.flags as ParsedFlags;
  if (flags['--dangerously-skip-permissions']) {
    client.dangerouslySkipPermissions = true;
  }

  if (flags['--help']) {
    return printOperationHelpForTagCommand(flags, matchedTag, subcommandHint);
  }

  const positionalFields = subArgs.filter(a => !a.startsWith('-')).slice(1);

  return runTagOperation(client, {
    tag: matchedTag,
    operationId: subcommandHint,
    flags,
    positionalOperationFields: positionalFields,
  });
}
