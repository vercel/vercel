import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import getProjectByDeployment from '../../util/projects/get-project-by-deployment';
import { RollbackDescribeTelemetryClient } from '../../util/telemetry/commands/rollback/describe';
import { describeSubcommand } from './command';
import output from '../../output-manager';

// Mirrors the API schema for the rollback description body.
const MAX_DESCRIPTION_LENGTH = 250;

/**
 * Edits the description attached to an existing rollback.
 * @param {Client} client - The Vercel client instance
 * @param {string[]} argv - The subcommand arguments (after `rollback describe`)
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function describe(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new RollbackDescribeTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(describeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args, flags } = parsedArgs;

  const deployId = args[0];
  const description = flags['--description'];

  telemetry.trackCliArgumentUrlOrDeploymentId(deployId);
  telemetry.trackCliOptionDescription(description);

  if (!deployId) {
    output.error(
      `Missing deployment id or url. Usage: ${chalk.cyan(
        getCommandName(
          'rollback describe <deployment id/url> --description <text>'
        )
      )}`
    );
    return 1;
  }

  if (description === undefined) {
    output.error(
      `The ${chalk.cyan('--description')} option is required. Usage: ${chalk.cyan(
        getCommandName(
          'rollback describe <deployment id/url> --description <text>'
        )
      )}`
    );
    return 1;
  }

  const trimmedDescription = description.trim();
  if (trimmedDescription.length === 0) {
    output.error("The rollback description can't be empty.");
    return 1;
  }

  if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
    output.error(
      `The rollback description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`
    );
    return 1;
  }

  const { deployment, project } = await getProjectByDeployment({
    client,
    deployId,
  });

  try {
    output.spinner('Updating rollback description…');
    await client.fetch(
      `/v10/projects/${project.id}/rollback/${deployment.id}/update-description`,
      {
        body: { description: trimmedDescription },
        method: 'PATCH',
      }
    );
  } finally {
    output.stopSpinner();
  }

  output.log(
    `Updated rollback description for ${chalk.bold(deployment.url)} (${
      deployment.id
    })`
  );
  return 0;
}
