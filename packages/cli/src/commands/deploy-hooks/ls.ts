import chalk from 'chalk';
import type { DeployHook } from '@vercel-internals/types';
import type Client from '../../util/client';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import formatTable from '../../util/format-table';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandNamePlain } from '../../util/pkg-name';
import output from '../../output-manager';
import { AGENT_STATUS } from '../../util/agent-output-constants';
import { DeployHooksLsTelemetryClient } from '../../util/telemetry/commands/deploy-hooks/ls';
import { listSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateLsArgs } from '../../util/validate-ls-args';

export default async function ls(client: Client, argv: string[]) {
  const telemetry = new DeployHooksLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  const validationResult = validateLsArgs({
    commandName: 'deploy-hooks ls',
    args,
    maxArgs: 0,
    exitCode: 2,
  });
  if (validationResult !== 0) {
    return validationResult;
  }

  telemetry.trackCliOptionFormat(opts['--format'] as string | undefined);
  telemetry.trackCliOptionProject(opts['--project'] as string | undefined);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const { contextName } = await getScope(client);
  const lsStamp = stamp();

  if (!client.nonInteractive) {
    output.spinner(`Fetching deploy hooks under ${chalk.bold(contextName)}`);
  }

  try {
    const project = await getProjectByCwdOrLink({
      client,
      commandName: 'deploy-hooks ls',
      projectNameOrId: opts['--project'] as string | undefined,
      forReadOnlyCommand: true,
    });

    const hooks: DeployHook[] = project.link?.deployHooks ?? [];

    if (asJson) {
      output.stopSpinner();
      const rows = hooks.map(h => ({
        id: h.id,
        name: h.name,
        ref: h.ref,
        url: h.url,
        createdAt: h.createdAt,
      }));
      if (client.nonInteractive) {
        client.stdout.write(
          `${JSON.stringify(
            {
              status: AGENT_STATUS.OK,
              projectId: project.id,
              projectName: project.name,
              hooks: rows,
              message:
                hooks.length === 0
                  ? 'No deploy hooks for this project.'
                  : `Listed ${hooks.length} deploy hook${hooks.length === 1 ? '' : 's'}.`,
              next: [
                {
                  command: getCommandNamePlain(
                    'deploy-hooks create <name> --ref <branch>'
                  ),
                  when: 'Create a deploy hook',
                },
              ],
            },
            null,
            2
          )}\n`
        );
      } else {
        client.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
      }
      return 0;
    }

    output.stopSpinner();

    if (hooks.length === 0) {
      output.log(
        `No deploy hooks configured for ${chalk.bold(project.name)} ${lsStamp()}`
      );
      return 0;
    }

    output.log(
      `Deploy hooks for ${chalk.bold(project.name)} ${chalk.gray(lsStamp())}\n`
    );
    const rows = hooks.map(h => [h.name, h.id, h.ref, h.url]);
    output.print(
      `${formatTable(['name', 'id', 'ref', 'url'], ['l', 'l', 'l', 'l'], [{ rows }])}\n`
    );
    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
}
