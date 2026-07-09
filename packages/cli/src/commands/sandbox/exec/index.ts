import chalk from 'chalk';
import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import { help } from '../../help';
import output from '../../../output-manager';
import { sandboxCommand } from '../command';
import { execSubcommand } from './command';
import {
  resolveSandboxTarget,
  SandboxTargetError,
} from '../../../util/sandbox/target';
import { sandboxClient } from '../../../util/sandbox/client';
import { execInSandbox } from '../../../util/sandbox/exec-core';
import {
  assertSandboxName,
  parseDuration,
  parseKeyValues,
} from '../../../util/sandbox/args';

export default async function exec(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(execSubcommand.options)
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(
      help(execSubcommand, {
        parent: sandboxCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  const [name, command, ...args] = parsedArgs.args;

  try {
    assertSandboxName(name);

    if (!command) {
      throw new Error(
        [
          'Missing required argument: command.',
          `${chalk.bold('hint:')} Usage: vercel sandbox exec <name> <command> [...args]`,
        ].join('\n')
      );
    }

    const timeout = parsedArgs.flags['--timeout']
      ? parseDuration(parsedArgs.flags['--timeout'])
      : undefined;

    const { token, teamId, projectId } = await resolveSandboxTarget(client, {
      project: parsedArgs.flags['--project'],
    });

    const sandbox = await sandboxClient.get({
      name,
      token,
      teamId,
      projectId,
      resume: true,
      __includeSystemRoutes: true,
    });

    await execInSandbox({
      sandbox,
      command,
      args,
      cwd: parsedArgs.flags['--workdir'],
      env: parseKeyValues(parsedArgs.flags['--env'] ?? []),
      sudo: Boolean(parsedArgs.flags['--sudo']),
      interactive: Boolean(parsedArgs.flags['--interactive']),
      skipExtendingTimeout: Boolean(parsedArgs.flags['--no-extend-timeout']),
      timeout,
    });

    return 0;
  } catch (err) {
    printError(err);
    return err instanceof SandboxTargetError ? err.exitCode : 1;
  }
}
