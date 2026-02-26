import chalk from 'chalk';
import { frameworkList } from '@vercel/frameworks';
import { getCommandName } from '../../util/pkg-name';
import { ProjectInspectTelemetryClient } from '../../util/telemetry/commands/project/inspect';
import output from '../../output-manager';
import { inspectSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { formatProject } from '../../util/projects/format-project';
import stamp from '../../util/output/stamp';
import getTeamById from '../../util/teams/get-team-by-id';
import formatDate from '../../util/format-date';
import { validateJsonOutput } from '../../util/output-format';
import { getLinkedProject } from '../../util/projects/link';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import type Client from '../../util/client';

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ProjectInspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags } = parsedArgs;

  const name = args[0];
  telemetry.trackCliArgumentName(name);
  telemetry.trackCliFlagJson(flags['--json']);

  if (args.length !== 0 && args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('project inspect <name>')}`
      )}`
    );
    return 2;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;

  const inspectStamp = stamp();

  let project;
  if (name) {
    const result = await getProjectByNameOrId(client, name);
    if (result instanceof ProjectNotFound) {
      output.error(`Project not found: ${name}`);
      return 1;
    }
    project = result;
  } else {
    const link = await getLinkedProject(client, client.cwd);
    if (link.status === 'not_linked') {
      output.error(
        `No project found in the current directory. Run ${chalk.cyan(getCommandName('link'))} to link a project, or provide a project name.`
      );
      return 1;
    }
    if (link.status === 'error') {
      return link.exitCode;
    }
    project = link.project;
  }

  const org = await getTeamById(client, project.accountId);

  if (jsonOutput) {
    const framework = frameworkList.find(f => f.slug === project.framework);
    client.stdout.write(
      `${JSON.stringify(
        {
          id: project.id,
          name: project.name,
          owner: org.name,
          ownerSlug: org.slug,
          createdAt: project.createdAt,
          rootDirectory: project.rootDirectory ?? '.',
          nodeVersion: project.nodeVersion,
          framework: framework?.name ?? null,
          buildCommand: project.buildCommand ?? null,
          outputDirectory: project.outputDirectory ?? null,
          installCommand: project.installCommand ?? null,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  const projectSlugLink = formatProject(org.slug, project.name);

  output.log(`Found Project ${projectSlugLink} ${chalk.gray(inspectStamp())}`);
  output.print('\n');
  output.print(chalk.bold('  General\n\n'));
  output.print(`    ${chalk.cyan('ID')}\t\t\t\t${project.id}\n`);
  output.print(`    ${chalk.cyan('Name')}\t\t\t${project.name}\n`);
  output.print(`    ${chalk.cyan('Owner')}\t\t\t${org.name}\n`);
  output.print(
    `    ${chalk.cyan('Created At')}\t\t\t${formatDate(project.createdAt)}\n`
  );
  output.print(
    `    ${chalk.cyan('Root Directory')}\t\t${project.rootDirectory ?? '.'}\n`
  );
  output.print(
    `    ${chalk.cyan('Node.js Version')}\t\t${project.nodeVersion}\n`
  );

  const framework = frameworkList.find(f => f.slug === project.framework);
  output.print('\n');
  output.print(chalk.bold('  Framework Settings\n\n'));
  output.print(`    ${chalk.cyan('Framework Preset')}\t\t${framework?.name}\n`);
  output.print(
    `    ${chalk.cyan('Build Command')}\t\t${project.buildCommand ?? chalk.dim(framework?.settings?.buildCommand.placeholder ?? 'None')}\n`
  );
  output.print(
    `    ${chalk.cyan('Output Directory')}\t\t${project.outputDirectory ?? chalk.dim(framework?.settings?.outputDirectory.placeholder ?? 'None')}\n`
  );
  output.print(
    `    ${chalk.cyan('Install Command')}\t\t${project.installCommand ?? chalk.dim(framework?.settings?.installCommand.placeholder ?? 'None')}\n`
  );

  output.print('\n');

  return 0;
}
