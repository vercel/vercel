import execa from 'execa';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { help } from '../help';
import { runSubcommand, envCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { pullEnvRecords } from '../../util/env/get-env-records';
import parseTarget from '../../util/parse-target';
import { getCommandName } from '../../util/pkg-name';

/**
 * Parses argv for the run subcommand, splitting on `--` to separate
 * vercel flags from the user's command.
 */
function parseRunArgs(argv: string[]) {
  const argvIndex = argv.indexOf('--');
  const hasDoubleDash = argvIndex !== -1;

  // Everything before '--' are the vercel env run flags
  const vercelArgs = hasDoubleDash ? argv.slice(2, argvIndex) : argv.slice(2);

  // Everything after '--' is the user's command
  const userCommand = hasDoubleDash ? argv.slice(argvIndex + 1) : [];

  return { vercelArgs, userCommand };
}

/**
 * Checks if --help was passed in the vercel args (before `--`).
 * Used by the parent to handle help consistently with other subcommands.
 */
export function needsHelpForRun(client: Client): boolean {
  const { vercelArgs } = parseRunArgs(client.argv);
  const flagsSpecification = getFlagsSpecification(runSubcommand.options);

  try {
    const parsedArgs = parseArguments(vercelArgs, flagsSpecification);
    return Boolean(parsedArgs.flags['--help']);
  } catch {
    return false;
  }
}

export default async function run(client: Client): Promise<number> {
  const { vercelArgs, userCommand } = parseRunArgs(client.argv);

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(runSubcommand.options);

  try {
    parsedArgs = parseArguments(vercelArgs, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (userCommand.length === 0) {
    output.error(
      `No command provided. Usage: ${getCommandName('env run -- <command>')}`
    );
    output.print(
      help(runSubcommand, {
        parent: envCommand,
        columns: client.stderr.columns,
      })
    );
    return 1;
  }

  // Get the linked project
  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const environment =
    parseTarget({
      flagName: 'environment',
      flags: parsedArgs.flags,
    }) || 'development';

  const gitBranch = parsedArgs.flags['--git-branch'];

  output.spinner(`Downloading \`${environment}\` Environment Variables`);

  const records = await pullEnvRecords(
    client,
    link.project.id,
    'vercel-cli:env:run',
    {
      target: environment,
      gitBranch,
    }
  );

  output.stopSpinner();

  output.debug(
    `Running command with ${Object.keys(records.env).length} environment variables`
  );

  try {
    const result = await execa(userCommand[0], userCommand.slice(1), {
      cwd: client.cwd,
      stdio: 'inherit',
      reject: false,
      env: {
        ...process.env,
        ...records.env,
      },
    });

    if (result instanceof Error && typeof result.exitCode !== 'number') {
      // Command does not exist or is not executable
      output.prettyError(result);
      return 1;
    }

    return result.exitCode;
  } catch (err: unknown) {
    output.prettyError(err);
    return 1;
  }
}
