import chalk from 'chalk';
import type { Project } from '@vercel-internals/types';
import type Client from '../../util/client';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import { getGlobalFlagsOnlyFromArgs } from '../../util/arg-common';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { buildCommandWithYes, outputAgentError } from '../../util/agent-output';
import output from '../../output-manager';
import { DeployHooksRmTelemetryClient } from '../../util/telemetry/commands/deploy-hooks/rm';
import { removeSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';

function deployHooksCommandWithGlobalFlags(
  baseSubcommand: string,
  argv: string[]
): string {
  const globalFlags = getGlobalFlagsOnlyFromArgs(argv.slice(2));
  const full = globalFlags.length
    ? `${baseSubcommand} ${globalFlags.join(' ')}`
    : baseSubcommand;
  return getCommandNamePlain(full);
}

export default async function rm(client: Client, argv: string[]) {
  const telemetry = new DeployHooksRmTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [hookId] = args;

  telemetry.trackCliArgumentId(hookId);
  telemetry.trackCliOptionProject(opts['--project'] as string | undefined);
  telemetry.trackCliFlagYes(opts['--yes']);

  if (!hookId) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_id',
          message: 'Deploy hook id is required. Pass it as the first argument.',
          next: [
            {
              command: deployHooksCommandWithGlobalFlags(
                'deploy-hooks ls',
                client.argv
              ),
            },
            {
              command: deployHooksCommandWithGlobalFlags(
                'deploy-hooks rm <id> --yes',
                client.argv
              ),
            },
          ],
        },
        1
      );
    }
    output.error(
      `${getCommandName('deploy-hooks rm <id>')} expects one argument`
    );
    return 1;
  }

  const skipConfirmation = opts['--yes'] || false;
  if (client.nonInteractive && !skipConfirmation) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'confirmation_required',
        message:
          'Removing a deploy hook requires confirmation. Re-run with --yes.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
  }

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        getCommandName('deploy-hooks rm <id>')
      )}`
    );
    return 1;
  }

  const { contextName } = await getScope(client);

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'deploy-hooks rm',
      projectNameOrId: opts['--project'] as string | undefined,
      forReadOnlyCommand: true,
    });
  } catch (err: unknown) {
    printError(err);
    return 1;
  }

  const existing = project.link?.deployHooks?.find(h => h.id === hookId);
  if (!existing) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'not_found',
          message: `No deploy hook ${param(hookId)} on project ${project.name}.`,
          next: [
            {
              command: deployHooksCommandWithGlobalFlags(
                'deploy-hooks ls',
                client.argv
              ),
            },
          ],
        },
        1
      );
    }
    output.error(
      `No deploy hook ${param(hookId)} on project ${param(project.name)}`
    );
    return 1;
  }

  if (!client.nonInteractive) {
    const confirmed = await client.input.confirm(
      `Remove deploy hook ${chalk.bold(existing.name)} (${hookId}) from ${chalk.bold(project.name)}?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled.');
      return 0;
    }
  }

  const rmStamp = stamp();

  if (!client.nonInteractive) {
    output.spinner(
      `Removing deploy hook under ${chalk.bold(contextName)} ${chalk.gray(rmStamp)}`
    );
  }

  try {
    await client.fetch(
      `/v2/projects/${encodeURIComponent(project.id)}/deploy-hooks/${encodeURIComponent(hookId)}`,
      { method: 'DELETE' }
    );
    output.stopSpinner();
    output.success(
      `Removed deploy hook ${chalk.bold(hookId)} from ${chalk.bold(project.name)} ${rmStamp()}`
    );
    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err) && err.status === 404) {
      output.error(
        `No deploy hook ${param(hookId)} on project ${param(project.name)}`
      );
      return 1;
    }
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    printError(err);
    return 1;
  }
}
