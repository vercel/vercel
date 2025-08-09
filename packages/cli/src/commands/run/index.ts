import { spawn } from 'child_process';
import chalk from 'chalk';
import type Client from '../../util/client';
import type { LoginResult } from '../../util/login/types';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { pullEnvRecords } from '../../util/env/get-env-records';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { runCommand } from './command';
import { help } from '../help';
import prompt from '../../util/login/prompt';

export default async function run(client: Client): Promise<number> {
  let parsedArgs;

  try {
    parsedArgs = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(runCommand.options),
      {
        permissive: true,
      }
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(help(runCommand, { columns: client.stderr.columns }));
    return 2;
  }

  // Get the command and arguments to execute
  const commandArgs = parsedArgs.args.slice(1);
  if (commandArgs.length === 0) {
    output.error(
      `Missing command to run. Usage: ${getCommandName('run <command> [...args]')}`
    );
    return 1;
  }

  const [command, ...args] = commandArgs;
  const target = parsedArgs.flags['--target'];
  const gitBranch = parsedArgs.flags['--git-branch'];

  // Step 1: Perform a fresh login (keep token in memory only)
  output.print('Performing fresh authentication...\n');
  let loginResult: LoginResult;

  try {
    loginResult = await prompt(client);
  } catch (err) {
    printError(err);
    return 1;
  }

  if (typeof loginResult === 'number') {
    return loginResult;
  }

  // Create a temporary client with the new token (don't persist to disk)
  const tempClient = Object.create(client);
  tempClient.authConfig = { ...client.authConfig, token: loginResult.token };

  if (loginResult.teamId) {
    tempClient.config = { ...client.config, currentTeam: loginResult.teamId };
  }

  output.print(`${chalk.green('✓')} Authenticated successfully\n`);

  // Step 2: Get the linked project
  const link = await getLinkedProject(tempClient);
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

  tempClient.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  // Step 3: Fetch environment variables
  output.print('Fetching environment variables...\n');

  let envResult;
  try {
    envResult = await pullEnvRecords(
      tempClient,
      project.id,
      'vercel-cli:env:pull',
      {
        target,
        gitBranch,
      }
    );
  } catch (err) {
    output.error('Failed to fetch environment variables');
    printError(err);
    return 1;
  }

  const { env, buildEnv } = envResult;
  const allEnvs = { ...env, ...buildEnv };
  const envCount = Object.keys(allEnvs).length;

  output.print(
    `${chalk.green('✓')} Fetched ${envCount} environment variable${envCount !== 1 ? 's' : ''}\n`
  );

  // Step 4: Execute the command with environment variables
  output.print(`Running: ${chalk.cyan(command)} ${args.join(' ')}\n\n`);

  return new Promise(resolve => {
    const childProcess = spawn(command, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...allEnvs,
      },
      shell: true,
    });

    childProcess.on('close', code => {
      resolve(code || 0);
    });

    childProcess.on('error', error => {
      output.error(`Failed to execute command: ${error.message}`);
      resolve(1);
    });

    // Handle termination signals
    process.on('SIGTERM', () => childProcess.kill('SIGTERM'));
    process.on('SIGINT', () => childProcess.kill('SIGINT'));
  });
}
