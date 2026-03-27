import chalk from 'chalk';
import { frameworkList } from '@vercel/frameworks';
import { getCommandName, packageName } from '../../util/pkg-name';
import { ProjectInspectTelemetryClient } from '../../util/telemetry/commands/project/inspect';
import output from '../../output-manager';
import { inspectSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import { formatProject } from '../../util/projects/format-project';
import stamp from '../../util/output/stamp';
import getTeamById from '../../util/teams/get-team-by-id';
import formatDate from '../../util/format-date';
import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import { ensureLink } from '../../util/link/ensure-link';
import { resolveProjectCwd } from '../../util/projects/find-project-root';
import { emitActionRequiredJsonAndExit } from '../../util/agent-output';
import type { Project } from '@vercel-internals/types';

/** Flags after `project inspect [name]` for suggested follow-up commands. Omits `--yes` (inspect must not auto-create/link via --yes). */
function getPreservedGlobalFlagsAfterProjectInspect(argv: string[]): string {
  const args = argv.slice(2);
  const inspectIdx = args.indexOf('inspect');
  if (inspectIdx < 1 || args[inspectIdx - 1] !== 'project') {
    return '';
  }
  let i = inspectIdx + 1;
  if (i < args.length && !args[i].startsWith('-')) {
    i++;
  }
  const tail = args.slice(i).filter(a => a !== '--yes' && a !== '-y');
  return tail.length ? ` ${tail.join(' ')}` : '';
}

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
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('project inspect <name>')}`
      )}`
    );
    return 2;
  }

  const inspectStamp = stamp();
  let project: Project;

  if (name) {
    const byName = await getProjectByNameOrId(client, name);
    if (byName instanceof ProjectNotFound) {
      throw byName;
    }
    project = byName;
  } else {
    const cwd = await resolveProjectCwd(client.cwd);
    const link = await getLinkedProject(client, cwd);

    if (link.status === 'error') {
      return link.exitCode;
    }

    if (link.status === 'not_linked') {
      const msg =
        'No Vercel project is linked to this directory. Link a project or pass a project name (e.g. `vercel project inspect <name>`).';

      if (client.isAgent) {
        const suffix = getPreservedGlobalFlagsAfterProjectInspect(client.argv);
        emitActionRequiredJsonAndExit(client, {
          status: 'action_required',
          reason: 'missing_requirements',
          message: msg,
          missing: ['project_link'],
          hint: 'Run `vercel link` to link an existing project, or `vercel project add <name>` to create one, then run `vercel project inspect` again. You can also inspect by name without linking: `vercel project inspect <name>`.',
          next: [
            {
              command: `${packageName} link${suffix}`,
              when: 'Link this directory to an existing project',
            },
            {
              command: `${packageName} project add <project-name>${suffix}`,
              when: 'Create a new project (replace <project-name>)',
            },
            {
              command: `${packageName} project inspect <project-name>${suffix}`,
              when: 'Inspect a project by name without linking',
            },
          ],
        });
      }

      if (client.nonInteractive) {
        output.error(msg);
        return 1;
      }

      output.print(`${msg}\n`);
      const linked = await ensureLink('project inspect', client, cwd, {
        autoConfirm: false,
        nonInteractive: false,
        link: { status: 'not_linked', org: null, project: null },
      });

      if (typeof linked === 'number') {
        return linked;
      }

      if (linked.status === 'error') {
        return linked.exitCode;
      }

      project = linked.project;
    } else {
      project = link.project;
    }
  }

  const org = await getTeamById(client, project.accountId);
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
