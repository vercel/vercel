import chalk from 'chalk';
import { APIError, type Sandbox } from '@vercel/sandbox';
import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import { help } from '../../help';
import output from '../../../output-manager';
import { sandboxCommand } from '../command';
import { runSubcommand } from './command';
import { buildCreateOptions, runCreate } from '../create';
import {
  resolveSandboxTarget,
  SandboxTargetError,
} from '../../../util/sandbox/target';
import { sandboxClient } from '../../../util/sandbox/client';
import { execInSandbox } from '../../../util/sandbox/exec-core';
import { parseKeyValues } from '../../../util/sandbox/args';

function isSandboxNotFound(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.cause instanceof APIError &&
    err.cause.response.status === 404
  );
}

export default async function run(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(runSubcommand.options)
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(
      help(runSubcommand, {
        parent: sandboxCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  const [command, ...args] = parsedArgs.args;
  const flags = parsedArgs.flags;
  const removeAfterUse = Boolean(flags['--rm']);
  const stopAfterUse = Boolean(flags['--stop']);

  let sandbox: Sandbox | undefined;

  try {
    if (removeAfterUse && stopAfterUse) {
      throw new Error('--rm and --stop are mutually exclusive.');
    }

    if (!command) {
      throw new Error(
        [
          'Missing required argument: command.',
          `${chalk.bold('hint:')} Usage: vercel sandbox run <command> [...args]`,
        ].join('\n')
      );
    }

    const createOpts = buildCreateOptions(flags);

    if (createOpts.name) {
      const { token, teamId, projectId } = await resolveSandboxTarget(client, {
        project: createOpts.project,
      });

      try {
        sandbox = await sandboxClient.get({
          name: createOpts.name,
          token,
          teamId,
          projectId,
          resume: true,
          __includeSystemRoutes: true,
        });
      } catch (err) {
        if (isSandboxNotFound(err)) {
          sandbox = await runCreate(client, {
            ...createOpts,
            nonPersistent: createOpts.nonPersistent || removeAfterUse,
          });
        } else {
          throw err;
        }
      }
    } else {
      sandbox = await runCreate(client, {
        ...createOpts,
        nonPersistent: createOpts.nonPersistent || removeAfterUse,
      });
    }

    try {
      await execInSandbox({
        sandbox,
        command,
        args,
        cwd: flags['--workdir'],
        env: parseKeyValues(flags['--env'] ?? []),
        sudo: Boolean(flags['--sudo']),
        interactive: Boolean(flags['--interactive']),
        skipExtendingTimeout: Boolean(flags['--no-extend-timeout']),
        timeout: undefined,
      });
    } finally {
      if (removeAfterUse) {
        await sandbox.delete();
      } else if (stopAfterUse) {
        await sandbox.stop();
      }
    }

    return 0;
  } catch (err) {
    printError(err);
    return err instanceof SandboxTargetError ? err.exitCode : 1;
  }
}
