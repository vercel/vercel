import pc from 'picocolors';
import { frameworkList } from '@vercel/frameworks';
import { getCommandName } from '../../util/pkg-name';
import { ProjectInspectTelemetryClient } from '../../util/telemetry/commands/project/inspect';
import output from '../../output-manager';
import { inspectSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { formatProject } from '../../util/projects/format-project';
import stamp from '../../util/output/stamp';
import getTeamById from '../../util/teams/get-team-by-id';
import formatDate from '../../util/format-date';
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
  const { args } = parsedArgs;

  const name = args[0];
  telemetry.trackCliArgumentName(name);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);

  if (args.length !== 0 && args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${pc.cyan(
        `${getCommandName('project inspect <name>')}`
      )}`
    );
    return 2;
  }

  const inspectStamp = stamp();
  const project = await getProjectByCwdOrLink({
    autoConfirm: parsedArgs.flags['--yes'],
    client,
    commandName: 'project inspect',
    projectNameOrId: name,
  });

  const org = await getTeamById(client, project.accountId);
  const projectSlugLink = formatProject(org.slug, project.name);

  output.log(`Found Project ${projectSlugLink} ${pc.gray(inspectStamp())}`);
  output.print('\n');
  output.print(pc.bold('  General\n\n'));
  output.print(`    ${pc.cyan('ID')}\t\t\t\t${project.id}\n`);
  output.print(`    ${pc.cyan('Name')}\t\t\t${project.name}\n`);
  output.print(`    ${pc.cyan('Owner')}\t\t\t${org.name}\n`);
  output.print(
    `    ${pc.cyan('Created At')}\t\t\t${formatDate(project.createdAt)}\n`
  );
  output.print(
    `    ${pc.cyan('Root Directory')}\t\t${project.rootDirectory ?? '.'}\n`
  );
  output.print(`    ${pc.cyan('Node.js Version')}\t\t${project.nodeVersion}\n`);

  const framework = frameworkList.find(f => f.slug === project.framework);
  output.print('\n');
  output.print(pc.bold('  Framework Settings\n\n'));
  output.print(`    ${pc.cyan('Framework Preset')}\t\t${framework?.name}\n`);
  output.print(
    `    ${pc.cyan('Build Command')}\t\t${project.buildCommand ?? pc.dim(framework?.settings?.buildCommand.placeholder ?? 'None')}\n`
  );
  output.print(
    `    ${pc.cyan('Output Directory')}\t\t${project.outputDirectory ?? pc.dim(framework?.settings?.outputDirectory.placeholder ?? 'None')}\n`
  );
  output.print(
    `    ${pc.cyan('Install Command')}\t\t${project.installCommand ?? pc.dim(framework?.settings?.installCommand.placeholder ?? 'None')}\n`
  );

  output.print('\n');

  return 0;
}
