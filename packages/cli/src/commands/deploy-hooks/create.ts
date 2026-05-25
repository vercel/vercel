import chalk from 'chalk';
import type { Project } from '@vercel-internals/types';
import type Client from '../../util/client';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import { getCommandNamePlain } from '../../util/pkg-name';
import {
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import output from '../../output-manager';
import { DeployHooksCreateTelemetryClient } from '../../util/telemetry/commands/deploy-hooks/create';
import { createSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';

export default async function create(client: Client, argv: string[]) {
  const telemetry = new DeployHooksCreateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(createSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }

  const { args, flags: opts } = parsedArgs;
  let [nameArg] = args;
  let ref = opts['--ref'] as string | undefined;

  telemetry.trackCliArgumentName(nameArg);
  telemetry.trackCliOptionRef(ref);
  telemetry.trackCliOptionProject(opts['--project'] as string | undefined);

  const { contextName } = await getScope(client);

  if (!client.nonInteractive) {
    output.spinner(`Loading project under ${chalk.bold(contextName)}`);
  }

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'deploy-hooks create',
      projectNameOrId: opts['--project'] as string | undefined,
    });
  } catch (err: unknown) {
    output.stopSpinner();
    exitWithNonInteractiveError(client, err, 1, { variant: 'checks' });
    printError(err);
    return 1;
  }

  output.stopSpinner();

  if (!project.link) {
    const message =
      'This project is not connected to a Git repository, so it cannot have deploy hooks. Connect a repo under Project Settings → Git.';
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message,
        },
        1
      );
    }
    output.error(message);
    return 1;
  }

  if (!nameArg) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message:
            'Deploy hook name is required. Pass it as the first argument after `create`.',
          next: [
            {
              command: getCommandNamePlain(
                'deploy-hooks create <name> --ref <branch>'
              ),
            },
          ],
        },
        1
      );
    }
    nameArg = await client.input.text({
      message: 'Deploy hook name:',
      validate: (val: string) => {
        if (!val?.trim()) return 'Name is required';
        if (val.trim().length > 180)
          return 'Name must be at most 180 characters';
        return true;
      },
    });
  }

  const name = nameArg.trim();
  if (!name) {
    output.error('Deploy hook name cannot be empty.');
    return 1;
  }

  if (!ref) {
    const defaultRef =
      project.link.productionBranch && project.link.productionBranch.trim()
        ? project.link.productionBranch.trim()
        : 'main';
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message:
            'Git branch ref is required in non-interactive mode. Pass `--ref <branch>`.',
          next: [
            {
              command: getCommandNamePlain(
                `deploy-hooks create ${name} --ref <branch>`
              ),
            },
          ],
        },
        1
      );
    }
    ref = await client.input.text({
      message: 'Git branch ref to deploy:',
      default: defaultRef,
      validate: (val: string) =>
        val?.trim() ? true : 'Branch ref is required',
    });
  }

  const refTrimmed = ref.trim();
  if (!refTrimmed) {
    output.error('Branch ref cannot be empty.');
    return 1;
  }

  const previousIds = new Set((project.link.deployHooks ?? []).map(h => h.id));

  if (!client.nonInteractive) {
    output.spinner(`Creating deploy hook on ${chalk.bold(project.name)}`);
  }

  const createStamp = stamp();

  try {
    const updated = await client.fetch<Project>(
      `/v2/projects/${encodeURIComponent(project.id)}/deploy-hooks`,
      {
        method: 'POST',
        body: { name, ref: refTrimmed },
      }
    );

    const created = (updated.link?.deployHooks ?? []).find(
      h => !previousIds.has(h.id)
    );

    output.stopSpinner();

    if (client.nonInteractive) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: AGENT_STATUS.OK,
            hook: created ?? { name, ref: refTrimmed },
            projectId: project.id,
            projectName: project.name,
            message: created
              ? `Created deploy hook ${created.id} on ${project.name}.`
              : `Created deploy hook on ${project.name}.`,
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'deploy-hooks ls'
                ),
                when: 'List deploy hooks for this project',
              },
            ],
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    output.success(
      `Deploy hook created on ${chalk.bold(project.name)} ${createStamp()}`
    );
    if (created) {
      output.print('\n');
      output.print(`  ${chalk.cyan('Name'.padEnd(12))}${created.name}\n`);
      output.print(`  ${chalk.cyan('Branch'.padEnd(12))}${created.ref}\n`);
      output.print(`  ${chalk.cyan('ID'.padEnd(12))}${created.id}\n`);
      output.print(`  ${chalk.cyan('URL'.padEnd(12))}${created.url}\n`);
      output.print(
        `\n${chalk.dim('Anyone with the URL can trigger a deployment. Store it securely.')}\n`
      );
    }
    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: AGENT_REASON.API_ERROR,
            message: err.message,
          },
          1
        );
        return 1;
      }
      output.error(err.message);
      return 1;
    }
    exitWithNonInteractiveError(client, err, 1, { variant: 'checks' });
    printError(err);
    return 1;
  }
}
