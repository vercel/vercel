import chalk from 'chalk';
import type Client from '../../util/client';
import type { Project } from '@vercel-internals/types';
import output from '../../output-manager';
import stamp from '../../util/output/stamp';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { ProjectResumeTelemetryClient } from '../../util/telemetry/commands/project/resume';
import { resumeSubcommand } from './command';
import { exitWithNonInteractiveError } from '../../util/agent-output';

export default async function resume(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ProjectResumeTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(resumeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags } = parsedArgs;

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        getCommandName('project resume [project]')
      )}`
    );
    return 2;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliArgumentProject(args[0]);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project resume',
      projectNameOrId: args[0],
      forReadOnlyCommand: true,
    });
  } catch (error) {
    exitWithNonInteractiveError(client, error, 1, { variant: 'resume' });
    printError(error);
    return 1;
  }

  const resumeStamp = stamp();
  try {
    await client.fetch(
      `/v1/projects/${encodeURIComponent(project.id)}/unpause`,
      {
        method: 'POST',
      }
    );
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'resume' });
    if (isAPIError(err)) {
      if (err.status === 404) {
        output.error(`Project not found.`);
        return 1;
      }
      if (err.status === 403) {
        output.error(
          err.serverMessage ||
            'You do not have permission to resume this project.'
        );
        return 1;
      }
    }
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        { id: project.id, name: project.name, paused: false },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.success(
    `Production traffic for ${chalk.bold(project.name)} resumed ${chalk.gray(
      resumeStamp()
    )}`
  );
  return 0;
}
