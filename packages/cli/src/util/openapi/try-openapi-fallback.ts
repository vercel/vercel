import type Client from '../client';
import { parseArguments } from '../get-args';
import { getFlagsSpecification } from '../get-flags-specification';
import { apiCommand } from '../../commands/api/command';
import {
  runTagOperation,
  printOperationHelpForTagCommand,
} from '../../commands/api/index';
import type { ParsedFlags } from '../../commands/api/types';

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
