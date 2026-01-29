import chalk from 'chalk';
import type Client from '../../util/client';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getOidcTokenSubcommand } from './command';

export default async function getOidcToken(client: Client, argv: string[]) {
  let parsedArgs: { args: string[] } | null = null;
  const flagsSpecification = getFlagsSpecification(
    getOidcTokenSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args } = parsedArgs;

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('project get-oidc-token <name>')}`
      )}`
    );
    return 1;
  }

  const name = args[0];
  try {
    const res = await client.fetch<{ token: string }>(
      `/projects/${encodeURIComponent(name)}/token`,
      {
        method: 'POST',
        body: JSON.stringify({
          source: 'vercel-cli',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    output.print(res.token);
    output.print('\n');
    return 0;
  } catch (err: unknown) {
    if (isAPIError(err) && err.status === 404) {
      output.error('No such project exists');
      return 1;
    }
    if (isAPIError(err) && err.status === 403) {
      output.error(err.message);
      return 1;
    }
  }
}
