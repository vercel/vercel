import chalk from 'chalk';
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
import { formatSandboxRegionList } from '../../util/projects/sandbox-config';
import stamp from '../../util/output/stamp';
import getTeamByIdOrSlug from '../../util/teams/get-team-by-id-or-slug';
import formatDate from '../../util/format-date';
import type Client from '../../util/client';
import { exitWithNonInteractiveError } from '../../util/agent-output';
import { validateJsonOutput } from '../../util/output-format';
import type { Project } from '@vercel-internals/types';

/**
 * Builds the stable, limited JSON contract for project inspection.
 *
 * Settings fields retain their persisted API values: `null` means the project
 * has no explicit override, even when the human view renders a framework default.
 */
function toProjectInspectJson(
  project: Project,
  owner: { name: string; slug: string }
) {
  return {
    id: project.id,
    name: project.name,
    owner: {
      name: owner.name,
      slug: owner.slug,
    },
    createdAt: project.createdAt,
    rootDirectory: project.rootDirectory ?? null,
    nodeVersion: project.nodeVersion ?? null,
    framework: project.framework ?? null,
    buildCommand: project.buildCommand ?? null,
    outputDirectory: project.outputDirectory ?? null,
    installCommand: project.installCommand ?? null,
    sandbox: project.sandbox
      ? {
          region: project.sandbox.region ?? null,
          failoverRegions: project.sandbox.failoverRegions ?? [],
        }
      : null,
  };
}

const getProjectForInspect = async (
  client: Client,
  projectNameOrId: string | undefined,
  autoConfirm: boolean | undefined
) => {
  try {
    return await getProjectByCwdOrLink({
      autoConfirm,
      client,
      commandName: 'project inspect',
      projectNameOrId,
      forReadOnlyCommand: true,
    });
  } catch (error: unknown) {
    exitWithNonInteractiveError(client, error, 1, { variant: 'inspect' });
    printError(error, client);
    return null;
  }
};

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
    printError(error, client);
    return 2;
  }
  const { args, flags } = parsedArgs;

  const name = args[0];
  telemetry.trackCliArgumentName(name);
  telemetry.trackCliFlagYes(flags['--yes']);
  telemetry.trackCliOptionFormat(flags['--format']);
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
    return 2;
  }

  const inspectStamp = stamp();
  const project = await getProjectForInspect(client, name, flags['--yes']);
  if (!project) {
    return 1;
  }

  const org = await getTeamByIdOrSlug(client, project.accountId);

  if (formatResult.jsonOutput) {
    client.stdout.write(
      `${JSON.stringify(toProjectInspectJson(project, org), null, 2)}\n`
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

  const failoverRegions = project.sandbox?.failoverRegions ?? [];
  if (project.sandbox?.region || failoverRegions.length > 0) {
    output.print('\n');
    output.print(chalk.bold('  Sandbox\n\n'));
    output.print(
      `    ${chalk.cyan('Region')}\t\t\t${project.sandbox?.region ?? chalk.dim('Auto')}\n`
    );
    output.print(
      `    ${chalk.cyan('Failover Regions')}\t\t${failoverRegions.length > 0 ? formatSandboxRegionList(failoverRegions) : chalk.dim('None')}\n`
    );
  }

  output.print('\n');

  return 0;
}
