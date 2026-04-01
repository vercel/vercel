import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import table from '../../util/output/table';
import Now from '../../util';
import getAliases from '../../util/alias/get-aliases';
import elapsed from '../../util/output/elapsed';
import { normalizeURL } from '../../util/url';
import getScope from '../../util/get-scope';
import { isValidName } from '../../util/is-valid-name';
import removeProject from '../../util/projects/remove-project';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import getDeployment from '../../util/get-deployment';
import getDeploymentsByProjectId from '../../util/deploy/get-deployments-by-project-id';
import { getCommandName } from '../../util/pkg-name';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import type Client from '../../util/client';
import type { Alias, Deployment, Project } from '@vercel-internals/types';
import { NowError } from '../../util/now-error';
import { help } from '../help';
import { removeCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { RemoveTelemetryClient } from '../../util/telemetry/commands/remove';
import output from '../../output-manager';

type DeploymentWithAliases = Deployment & {
  aliases: Alias[];
};

export default async function remove(client: Client) {
  const telemetryClient = new RemoveTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(removeCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetryClient.trackCliFlagHelp('remove');
    output.print(help(removeCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const ids = parsedArgs.args.slice(1);
  const hard = parsedArgs.flags['--hard'];
  const skipConfirmation = parsedArgs.flags['--yes'];
  const safe = parsedArgs.flags['--safe'];
  telemetryClient.trackCliArgumentNameOrDeploymentId(ids);
  telemetryClient.trackCliFlagSafe(safe);
  telemetryClient.trackCliFlagHard(hard);
  telemetryClient.trackCliFlagYes(skipConfirmation);

  const {
    config: { currentTeam },
  } = client;
  const { success, error, log } = output;

  if (ids.length < 1) {
    error(`${getCommandName('rm')} expects at least one argument`);
    output.print(help(removeCommand, { columns: client.stderr.columns }));
    return 1;
  }

  const invalidName = ids.find(name => !isValidName(name));

  if (invalidName) {
    error(
      `The provided argument "${invalidName}" is not a valid deployment or project`
    );
    return 1;
  }

  const { contextName } = await getScope(client);

  output.spinner(
    `Fetching deployment(s) ${ids
      .map(id => `"${id}"`)
      .join(' ')} in ${chalk.bold(contextName)}`
  );

  let aliases: Alias[][];
  let projects: Project[];
  let deployments: DeploymentWithAliases[];
  const findStart = Date.now();

  try {
    const searchFilter = (d: Deployment) =>
      ids.some(
        id =>
          d &&
          !(d instanceof NowError) &&
          (d.id === id || d.name === id || d.url === normalizeURL(id))
      );

    const [deploymentList, projectList] = await Promise.all<any>([
      Promise.all(
        ids.map(async idOrHost => {
          if (!contextName) {
            throw new Error('Context name is not defined');
          }
          return getDeployment(client, contextName, idOrHost).catch(err => err);
        })
      ),
      Promise.all(
        ids.map(async idOrName => getProjectByIdOrName(client, idOrName))
      ),
    ]);

    deployments = deploymentList.filter((d: any) => searchFilter(d));

    projects = projectList.filter((d: any) => searchFilter(d));

    // When `--safe` is set we want to replace all projects
    // with deployments to verify the aliases
    if (safe) {
      const projectDeployments = await Promise.all(
        projects.map(project => {
          return getDeploymentsByProjectId(client, project.id, {
            max: 201,
            continue: true,
          });
        })
      );

      // only process the first 201 projects
      const to = Math.min(projectDeployments.length, 201);
      for (let i = 0; i < to; i++) {
        for (const pDepl of projectDeployments[i]) {
          const depl = pDepl as DeploymentWithAliases;
          depl.aliases = [];
          deployments.push(depl);
        }
      }

      projects = [];
    } else {
      // Remove all deployments that are included in the projects
      deployments = deployments.filter(
        d => !projects.some(p => p.name === d.name)
      );
    }

    aliases = await Promise.all(
      deployments.map(async depl => {
        const { aliases } = await getAliases(client, depl.id);
        return aliases;
      })
    );
  } finally {
    output.stopSpinner();
  }

  deployments = deployments.filter((match, i) => {
    if (safe && aliases[i].length > 0) {
      return false;
    }

    match.aliases = aliases[i];
    return true;
  });

  if (deployments.length === 0 && projects.length === 0) {
    const safeUnaliased = parsedArgs.flags['--safe'] ? 'unaliased' : 'any';
    const stylizedIds = ids.map(id => chalk.bold(`"${id}"`)).join(', ');
    const commandName = getCommandName('projects ls');
    log(
      `Could not find ${safeUnaliased} deployments or projects matching ${stylizedIds}. Run ${commandName} to list.`
    );
    return 1;
  }

  log(
    `Found ${deploymentsAndProjects(deployments, projects)} for removal in ` +
      `${chalk.bold(contextName)} ${elapsed(Date.now() - findStart)}`
  );

  if (deployments.length > 200) {
    output.warn(
      'Only 200 deployments can get deleted at once. Please continue 10 minutes after deletion to remove the rest.'
    );
  }

  if (!skipConfirmation) {
    const confirmation = (
      await readConfirmation(deployments, projects)
    ).toLowerCase();

    if (confirmation !== 'y' && confirmation !== 'yes') {
      output.log('Canceled');
      return 1;
    }
  }

  const now = new Now({
    client,
    currentTeam,
  });
  const start = Date.now();

  await Promise.all([
    ...deployments.map(depl => now.remove(depl.id, { hard })),
    ...projects.map(project => removeProject(client, project.id)),
  ]);

  success(
    `Removed ${deploymentsAndProjects(deployments, projects)} ` +
      `${elapsed(Date.now() - start)}`
  );

  deployments.forEach(depl => {
    // consider changing to `output.log`
    output.print(`${chalk.gray('-')} ${chalk.bold(depl.url)}\n`);
  });

  projects.forEach((project: Project) => {
    // consider changing to `output.log`
    output.print(`${chalk.gray('-')} ${chalk.bold(project.name)}\n`);
  });

  return 0;
}

function readConfirmation(
  deployments: DeploymentWithAliases[],
  projects: Project[]
): Promise<string> {
  return new Promise(resolve => {
    if (deployments.length > 0) {
      output.log(
        `The following ${plural(
          'deployment',
          deployments.length,
          deployments.length > 1
        )} will be permanently removed:`
      );

      const deploymentTable = table(
        deployments.map(depl => {
          const time = chalk.gray(`${ms(Date.now() - depl.createdAt)} ago`);
          const url = depl.url ? chalk.underline(`https://${depl.url}`) : '';
          return [`  ${depl.id}`, url, time];
        }),
        { align: ['l', 'r', 'l'], hsep: 6 }
      );
      output.print(`${deploymentTable}\n`);
    }

    for (const depl of deployments) {
      for (const { alias } of depl.aliases) {
        output.warn(
          `${chalk.underline(`https://${alias}`)} is an alias for ` +
            `${chalk.bold(depl.url)} and will be removed`
        );
      }
    }

    if (projects.length > 0) {
      output.print(
        `The following ${plural(
          'project',
          projects.length,
          projects.length > 1
        )} will be permanently removed, ` +
          `including all ${
            projects.length > 1 ? 'their' : 'its'
          } deployments and aliases:\n`
      );

      for (const project of projects) {
        // consider changing to `output.log`
        output.print(`${chalk.gray('-')} ${chalk.bold(project.name)}\n`);
      }
    }

    output.print(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('(y/N) ')}`
    );

    process.stdin
      .on('data', d => {
        process.stdin.pause();
        resolve(d.toString().trim());
      })
      .resume();
  });
}

function deploymentsAndProjects(
  deployments: DeploymentWithAliases[],
  projects: Project[],
  conjunction = 'and'
) {
  if (!projects || projects.length === 0) {
    return `${plural('deployment', deployments.length, true)}`;
  }

  if (!deployments || deployments.length === 0) {
    return `${plural('project', projects.length, true)}`;
  }

  return (
    `${plural('deployment', deployments.length, true)} ` +
    `${conjunction} ${plural('project', projects.length, true)}`
  );
}
