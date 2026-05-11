import chalk from 'chalk';
import type Client from '../../util/client';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { validateJsonOutput } from '../../util/output-format';
import { tokenSubcommand } from './command';

export default async function getOidcToken(client: Client, argv: string[]) {
  const flagsSpecification = getFlagsSpecification(tokenSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags } = parsedArgs;

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  client.nonInteractive = true;

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('project token <name>')}`
      )}`
    );
    return 1;
  }
  const [name] = args;
  const project = await getProjectByCwdOrLink({
    autoConfirm: Boolean(flags['--yes']),
    nonInteractive: true,
    client,
    commandName: 'project token',
    projectNameOrId: name,
  });

  try {
    const res = await client.fetch<{ token: string }>(
      `/projects/${project.id}/token`,
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

    if (asJson) {
      client.stdout.write(`${JSON.stringify({ token: res.token }, null, 2)}\n`);
    } else {
      client.stdout.write(`${res.token}\n`);
    }

    return 0;
  } catch (err: unknown) {
    if (isAPIError(err) && err.status === 404) {
      output.error('No such project exists');
      return 1;
    }
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    output.error(`An unexpected error occurred!\n${err as string}`);
    return 1;
  }
}
