import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import table from 'text-table';
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
import getArgs from '../../util/get-args';
import handleError from '../../util/handle-error';
import type Client from '../../util/client';
import { Output } from '../../util/output';
import { Alias, Deployment, Project } from '@vercel-internals/types';
import { NowError } from '../../util/now-error';
import { help } from '../help';
import { removeCommand } from './command';

type DeploymentWithAliases = Deployment & {
  aliases: Alias[];
};

export default async function remove(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--hard': Boolean,
      '--yes': Boolean,
      '--safe': Boolean,
      '-y': '--yes',
      '-s': '--safe',
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  argv._ = argv._.slice(1);

  const {
    output,
    config: { currentTeam },
  } = client;
  const hard = argv['--hard'];
  const skipConfirmation = argv['--yes'];
  const safe = argv['--safe'];
  const ids: string[] = argv._;
  const { success, error, log } = output;

  if (argv['--help'] || ids[0] === 'help') {
    output.print(help(removeCommand, { columns: client.stderr.columns }));
    return 2;
  }

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
        ids.map(idOrHost => {
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
    if (
      safe &&
      (aliases[i].length > 0 ||
        ['QUEUED', 'INITIALIZING', 'BUILDING'].includes(match.status))
    ) {
      return false;
    }

    match.aliases = aliases[i];
    return true;
  });

  if (deployments.length === 0 && projects.length === 0) {
    log(
      `Could not find ${argv['--safe'] ? 'unaliased' : 'any'} deployments ` +
        `or projects matching ` +
        `${ids
          .map(id => chalk.bold(`"${id}"`))
          .join(', ')}. Run ${getCommandName('ls')} to list.`
    );
    return 1;
  }

  log(
    `Found ${deploymentsAndProjects(deployments, projects)} for removal in ` +
      `${chalk.bold(contextName)} ${elapsed(Date.now() - findStart)}`
  );

  if (deployments.length > 200) {
    output.warn(
      `Only 200 deployments can get deleted at once. ` +
        `Please continue 10 minutes after deletion to remove the rest.`
    );
  }

  if (!skipConfirmation) {
    const confirmation = (
      await readConfirmation(deployments, projects, output)
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

  await Promise.all<any>([
    ...deployments.map(depl => now.remove(depl.id, { hard })),
    ...projects.map(project => removeProject(client, project.id)),
  ]);

  success(
    `Removed ${deploymentsAndProjects(deployments, projects)} ` +
      `${elapsed(Date.now() - start)}`
  );

  deployments.forEach(depl => {
    console.log(`${chalk.gray('-')} ${chalk.bold(depl.url)}`);
  });

  projects.forEach((project: Project) => {
    console.log(`${chalk.gray('-')} ${chalk.bold(project.name)}`);
  });

  return 0;
}

function readConfirmation(
  deployments: DeploymentWithAliases[],
  projects: Project[],
  output: Output
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
        { align: ['l', 'r', 'l'], hsep: ' '.repeat(6) }
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
      console.log(
        `The following ${plural(
          'project',
          projects.length,
          projects.length > 1
        )} will be permanently removed, ` +
          `including all ${
            projects.length > 1 ? 'their' : 'its'
          } deployments and aliases:`
      );

      for (const project of projects) {
        console.log(`${chalk.gray('-')} ${chalk.bold(project.name)}`);
      }
    }

    output.print(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`
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
