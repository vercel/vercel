import chalk from 'chalk';
import output from '../../output-manager';
import { removeSubcommand, targetCommand } from './command';
import { ensureLink } from '../../util/link/ensure-link';
import { formatProject } from '../../util/projects/format-project';
import { STANDARD_ENVIRONMENTS } from '../../util/target/standard-environments';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import {
  outputActionRequired,
  buildCommandWithYes,
} from '../../util/agent-output';
import { TargetRemoveTelemetryClient } from '../../util/telemetry/commands/target/remove';
import type Client from '../../util/client';

export default async function rm(
  client: Client,
  argv: string[]
): Promise<number> {
  const { cwd } = client;

  const telemetry = new TargetRemoveTelemetryClient({
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
  const { args, flags } = parsedArgs;

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        'target remove <name>'
      )}`
    );
    return 2;
  }

  const [nameOrId] = args;
  const deleteUnassignedEnvVars = !!flags['--delete-unassigned-env-vars'];
  const projectName = flags['--project'];

  telemetry.trackCliArgumentName(nameOrId);
  telemetry.trackCliFlagDeleteUnassignedEnvVars(
    flags['--delete-unassigned-env-vars']
  );
  telemetry.trackCliOptionProject(projectName);
  telemetry.trackCliFlagYes(flags['--yes']);

  if (
    STANDARD_ENVIRONMENTS.includes(
      nameOrId as (typeof STANDARD_ENVIRONMENTS)[number]
    )
  ) {
    output.error(
      `${chalk.bold(
        nameOrId
      )} is a built-in environment and cannot be removed as a custom environment.`
    );
    return 1;
  }

  const autoConfirm = !!flags['--yes'];
  const link = await ensureLink(targetCommand.name, client, cwd, {
    autoConfirm,
    projectName,
    failIfNotFound: Boolean(projectName),
  });
  if (typeof link === 'number') {
    return link;
  }

  const projectSlugLink = formatProject(link.org.slug, link.project.name);

  if (!autoConfirm) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'confirmation_required',
          message: `Removing custom environment ${nameOrId} from ${link.org.slug}/${link.project.name}. Use --yes to confirm.`,
          next: [{ command: buildCommandWithYes(client.argv) }],
        },
        1
      );
    }
    const confirmed = await client.input.confirm(
      `Removing custom environment ${chalk.bold(
        nameOrId
      )} from Project ${chalk.bold(link.project.name)}. Are you sure?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  output.spinner(
    `Removing custom environment ${chalk.bold(nameOrId)} from ${projectSlugLink}`
  );

  const url = `/projects/${encodeURIComponent(
    link.project.id
  )}/custom-environments/${encodeURIComponent(nameOrId)}`;

  try {
    await client.fetch(url, {
      method: 'DELETE',
      accountId: link.org.id,
      body: deleteUnassignedEnvVars
        ? { deleteUnassignedEnvironmentVariables: true }
        : {},
    });
  } catch (error) {
    output.stopSpinner();
    if (isAPIError(error) && error.status === 404) {
      output.error(
        `Custom environment ${chalk.bold(
          nameOrId
        )} was not found under ${projectSlugLink}.`
      );
      return 1;
    }
    if (isAPIError(error) && error.status === 400) {
      output.error(error.serverMessage || 'The request was invalid.');
      return 1;
    }
    printError(error);
    return 1;
  }

  output.stopSpinner();

  output.log(
    `Removed custom environment ${chalk.bold(nameOrId)} from ${projectSlugLink}`
  );

  return 0;
}
