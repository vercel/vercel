import chalk from 'chalk';
import ms from 'ms';
import type Client from '../../util/client';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import createProject from '../../util/projects/create-project';
import output from '../../output-manager';
import { ProjectAddTelemetryClient } from '../../util/telemetry/commands/project/add';
import { addSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getScope from '../../util/get-scope';

export default async function add(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new ProjectAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
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
        `${getCommandName('project add <name>')}`
      )}`
    );

    if (args.length > 1) {
      const example = chalk.cyan(
        `${getCommandName(`project add "${args.join(' ')}"`)}`
      );
      output.log(
        `If your project name  has spaces, make sure to wrap it in quotes. Example: \n  ${example} `
      );
    }

    return 1;
  }

  const start = Date.now();

  const [name] = args;
  telemetryClient.trackCliArgumentName(name);

  try {
    await createProject(client, { name });
  } catch (err: unknown) {
    if (isAPIError(err) && err.code === 'too_many_projects') {
      output.prettyError(err);
      return 1;
    }
    if (isAPIError(err) && err.status === 409) {
      // project already exists, so we can
      // show a success message
    } else {
      throw err;
    }
  }
  const elapsed = ms(Date.now() - start);

  const { contextName } = await getScope(client);
  output.log(
    `${chalk.cyan('Success!')} Project ${chalk.bold(
      name.toLowerCase()
    )} added (${chalk.bold(contextName)}) ${chalk.gray(`[${elapsed}]`)}`
  );

  return 0;
}
