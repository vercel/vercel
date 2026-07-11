import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { connectResourceToProject } from '../../util/integration-resource/connect-resource-to-project';
import { getResources } from '../../util/integration-resource/get-resources';
import { getLinkedProject } from '../../util/projects/link';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound, isAPIError } from '../../util/errors-ts';
import { buildCommandWithYes, outputAgentError } from '../../util/agent-output';
import {
  VALID_ENVIRONMENTS,
  validateEnvironments,
} from '../../util/integration/post-provision-setup';
import { IntegrationResourceConnectTelemetryClient } from '../../util/telemetry/commands/integration-resource/connect';
import { connectSubcommand } from './command';

export async function connect(client: Client, argv: string[]) {
  const telemetry = new IntegrationResourceConnectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(connectSubcommand.options);

  try {
    parsedArguments = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArguments.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;
  const skipConfirmation = !!parsedArguments.flags['--yes'];
  const prefix = parsedArguments.flags['--prefix'];
  const environmentsFlag = parsedArguments.flags['--environment'];

  telemetry.trackCliOptionFormat(parsedArguments.flags['--format']);
  telemetry.trackCliFlagYes(skipConfirmation);
  telemetry.trackCliOptionPrefix(prefix);
  telemetry.trackCliOptionEnvironment(environmentsFlag);

  if (asJson && !skipConfirmation) {
    output.error('--format=json requires --yes to skip confirmation prompts');
    return 1;
  }

  if (parsedArguments.args.length < 1) {
    output.error('You must specify a resource. See `--help` for details.');
    return 1;
  }

  if (parsedArguments.args.length > 2) {
    output.error(
      'Too many arguments. Usage: `vercel integration resource connect <resource> [project]`.'
    );
    return 1;
  }

  if (prefix !== undefined && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(prefix)) {
    output.error(
      'Invalid --prefix value. It must start with a letter and contain only letters, digits, and underscores.'
    );
    return 1;
  }

  let environments: string[];
  if (environmentsFlag?.length) {
    const envValidation = validateEnvironments(environmentsFlag);
    if (!envValidation.valid) {
      output.error(
        `Invalid environment value: ${envValidation.invalid.map(e => `"${e}"`).join(', ')}. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`
      );
      return 1;
    }
    environments = environmentsFlag;
  } else {
    environments = [...VALID_ENVIRONMENTS];
  }

  const resourceName = parsedArguments.args[0];
  const specifiedProject: string | undefined = parsedArguments.args[1];

  telemetry.trackCliArgumentResource(resourceName);
  telemetry.trackCliArgumentProject(specifiedProject);

  const { team } = await getScope(client);
  if (!team) {
    output.error('Team not found.');
    return 1;
  }
  client.config.currentTeam = team.id;

  output.spinner('Retrieving resource…', 500);
  const resources = await getResources(client);
  const targetedResource = resources.find(
    resource => resource.name === resourceName
  );
  output.stopSpinner();

  if (!targetedResource) {
    output.error(`No resource ${chalk.bold(resourceName)} found.`);
    return 1;
  }

  let projectName: string | undefined = specifiedProject;
  if (!projectName) {
    projectName = await getLinkedProject(client).then(result => {
      if (result.status === 'linked') {
        return result.project.name;
      }
      return;
    });
    if (!projectName) {
      output.error(
        'No project linked. Either use `vc link` to link a project, or specify the project name.'
      );
      return 1;
    }
  }

  const alreadyConnected = targetedResource.projectsMetadata?.find(
    p => p.name === projectName
  );
  if (alreadyConnected) {
    output.error(
      `Project ${chalk.bold(projectName)} is already connected to resource ${chalk.bold(targetedResource.name)}.`
    );
    output.log(
      `To change environments or env var prefix, disconnect first: \`vercel integration resource disconnect ${targetedResource.name} ${projectName}\``
    );
    return 1;
  }

  output.spinner('Resolving project…', 500);
  const project = await getProjectByNameOrId(client, projectName);
  output.stopSpinner();

  if (project instanceof ProjectNotFound) {
    output.error(`No project ${chalk.bold(projectName)} found.`);
    return 1;
  }

  if (!skipConfirmation && client.nonInteractive) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'confirmation_required',
        message:
          'Connecting a resource requires confirmation. Re-run with --yes.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
    output.error(
      'Confirmation required. Use `--yes` to skip the confirmation prompt.'
    );
    return 1;
  }

  if (!skipConfirmation && !client.stdin.isTTY) {
    output.error(
      'Confirmation required. Use `--yes` to skip the confirmation prompt.'
    );
    return 1;
  }

  if (!skipConfirmation) {
    output.log(
      `The resource ${chalk.bold(targetedResource.name)} will be connected to project ${chalk.bold(projectName)} (environments: ${environments.join(', ')}).`
    );
    const confirmed = await client.input.confirm(
      `${chalk.cyan('Connect?')}`,
      true
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  try {
    output.spinner('Connecting resource…', 500);
    await connectResourceToProject(
      client,
      project.id,
      targetedResource.id,
      environments,
      prefix !== undefined ? { envVarPrefix: prefix } : undefined
    );
  } catch (error) {
    output.stopSpinner();
    if (isAPIError(error) && error.status === 400) {
      const conflict = error.serverMessage?.match(
        /existing environment variable with name ([A-Za-z_][A-Za-z0-9_]*)/
      );
      if (conflict) {
        const varName = conflict[1];
        // `vc env rm` accepts at most one environment positional; emit a single-env
        // form when exactly one was specified, otherwise the no-env form that prompts.
        const envRmCmd =
          environments.length === 1
            ? `vercel env rm ${varName} ${environments[0]}`
            : `vercel env rm ${varName}`;
        output.error(
          `Cannot connect: env var ${chalk.bold(varName)} already exists on project ${chalk.bold(projectName)} in one of the target environments (${environments.join(', ')}).`
        );
        if (prefix === undefined) {
          output.log(
            `Re-run with \`--prefix <PREFIX>_\` to namespace the new variables, or remove the existing one with \`${envRmCmd}\`.`
          );
        } else {
          output.log(
            `Prefix \`${prefix}\` did not avoid the collision. Try a different prefix or run \`${envRmCmd}\`.`
          );
        }
        return 1;
      }
    }
    output.error(
      `A problem occurred while connecting: ${(error as Error).message}`
    );
    return 1;
  }

  if (asJson) {
    output.stopSpinner();
    client.stdout.write(
      `${JSON.stringify(
        {
          resource: targetedResource.name,
          connected: true,
          project: projectName,
          environments,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.success(
    `Connected ${chalk.bold(targetedResource.name)} to ${chalk.bold(projectName)} (${environments.join(', ')})`
  );
  return 0;
}
