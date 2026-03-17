import { writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import output from '../../output-manager';
import getScope from '../../util/get-scope';
import type Client from '../../util/client';
import { ensureLink } from '../../util/link/ensure-link';
import stamp from '../../util/output/stamp';
import { createGroupSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import { isAPIError, ProjectNotFound } from '../../util/errors-ts';
import type { Project } from '@vercel-internals/types';
import type {
  MicrofrontendsGroupResponse,
  MicrofrontendsGroupsResponse,
} from './types';
import { validateDefaultRoute, validateRoutingPath } from './utils';

const MAX_GROUP_NAME_LENGTH = 48;

export default async function createGroup(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    createGroupSubcommand.options
  );
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const link = await ensureLink('microfrontends', client, client.cwd);
  if (typeof link === 'number') {
    return link;
  }

  const { project: linkedProject, org, repoRoot } = link;

  if (org.type !== 'team') {
    output.error('Microfrontends are only available for teams.');
    return 1;
  }

  client.config.currentTeam = org.id;
  const { team } = await getScope(client);

  if (!team) {
    output.error('Microfrontends are only available for teams.');
    return 1;
  }

  const teamSlug = team.slug;

  output.log(
    'A microfrontends group allows multiple projects to be composed into one application with a seamless user experience.'
  );
  output.log(
    `Creating a new microfrontends group for team ${chalk.bold(teamSlug)}.`
  );
  output.log('');

  output.spinner('Fetching microfrontends groups…');
  const groupsResponse = await client.fetch<MicrofrontendsGroupsResponse>(
    `/v1/microfrontends/groups?teamId=${team.id}`,
    { method: 'GET' }
  );
  output.stopSpinner();

  const { groups, maxMicrofrontendsGroupsPerTeam, maxMicrofrontendsPerGroup } =
    groupsResponse;

  const plan = team.billing.plan;
  const isProTrialPlan =
    team.billing.plan === 'pro' && team.billing.status === 'trialing';
  const isLimitedPlan = isProTrialPlan || plan === 'hobby';

  if (groups.length >= maxMicrofrontendsGroupsPerTeam) {
    if (isLimitedPlan) {
      const planName = isProTrialPlan ? 'Pro Trial' : 'Hobby';
      const url = `https://vercel.com/${teamSlug}/~/settings/billing`;
      output.log(
        `You've reached the microfrontends group limit for ${planName}. Upgrade to Pro to create more groups.`
      );
      output.log(`Upgrade: ${output.link(url, url, { fallback: false })}`);
      return 1;
    }
    output.error(
      `Maximum number of microfrontends groups (${maxMicrofrontendsGroupsPerTeam}) reached.`
    );
    return 1;
  }

  const existingMfeProjectCount = groups.reduce(
    (count, g) => count + g.projects.length,
    0
  );
  const freeProjects = 2;

  // A new group requires at least 1 project, so check early before prompting
  if (isLimitedPlan && existingMfeProjectCount + 1 > freeProjects) {
    const planName = isProTrialPlan ? 'Pro Trial' : 'Hobby';
    const url = `https://vercel.com/${teamSlug}/~/settings/billing`;
    output.log(
      `You've reached the microfrontends project limit for ${planName}. Upgrade to Pro to add more projects.`
    );
    output.log(`Upgrade: ${output.link(url, url, { fallback: false })}`);
    return 1;
  }

  const nameFlag = parsedArgs.flags['--name'] as string | undefined;
  const projectFlags = parsedArgs.flags['--project'] as string[] | undefined;
  const defaultAppFlag = parsedArgs.flags['--default-app'] as
    | string
    | undefined;
  const defaultRouteFlag = parsedArgs.flags['--default-route'] as
    | string
    | undefined;

  if (!client.stdin.isTTY) {
    output.error(
      'This command must be run interactively because it affects billing.'
    );
    return 1;
  }

  let groupName: string;
  if (nameFlag) {
    const validation = validateGroupName(nameFlag, groups);
    if (validation !== true) {
      output.error(validation);
      return 1;
    }
    groupName = nameFlag;
  } else {
    groupName = await client.input.text({
      message: 'Group name:',
      validate: (val: string) => validateGroupName(val, groups),
    });
  }

  let selectedProjects: Project[];
  if (projectFlags) {
    selectedProjects = [];
    for (const name of projectFlags) {
      try {
        const project = await getProjectByIdOrName(client, name, team.id);
        if (project instanceof ProjectNotFound) {
          output.error(`Project "${name}" not found.`);
          return 1;
        }
        selectedProjects.push(project);
      } catch {
        output.error(`Project "${name}" not found.`);
        return 1;
      }
    }
  } else {
    output.spinner('Fetching projects…');
    const firstPage = await client.fetch<{
      projects: Project[];
      pagination: { count: number; next: number | null };
    }>(`/v9/projects?limit=100&teamId=${team.id}`, { method: 'GET' });
    output.stopSpinner();

    const allProjects = firstPage.projects;
    const hasMoreProjects = firstPage.pagination.next !== null;
    const availableProjects = allProjects.filter(
      p => !isProjectInMicrofrontendsGroup(p, groups)
    );

    selectedProjects = [];
    let addMore = true;
    while (addMore) {
      let project: Project | undefined;

      if (hasMoreProjects) {
        await client.input.text({
          message:
            selectedProjects.length === 0
              ? 'Type a project name to add:'
              : 'Type another project name to add:',
          validate: async val => {
            if (!val) {
              return 'Project name cannot be empty';
            }
            const result = await getProjectByIdOrName(client, val, team.id);
            if (result instanceof ProjectNotFound) {
              return 'Project not found';
            }
            if (isProjectInMicrofrontendsGroup(result, groups)) {
              return `Project "${val}" is already in a microfrontends group`;
            }
            if (selectedProjects.some(s => s.id === result.id)) {
              return `Project "${val}" is already selected`;
            }
            project = result;
            return true;
          },
        });
      } else {
        if (availableProjects.length === 0) {
          if (selectedProjects.length === 0) {
            output.error(
              'No available projects. All projects are already in a microfrontends group.'
            );
            return 1;
          }
          break;
        }

        const remaining = availableProjects.filter(
          p => !selectedProjects.some(s => s.id === p.id)
        );
        if (remaining.length === 0) {
          break;
        }

        const projectId = await client.input.select({
          message:
            selectedProjects.length === 0
              ? 'Select a project to add:'
              : 'Select another project to add:',
          choices: remaining.map(p => ({ name: p.name, value: p.id })),
        });
        project = availableProjects.find(p => p.id === projectId);
      }

      if (project) {
        selectedProjects.push(project);
      }

      addMore = await client.input.confirm('Add another project?', false);
    }

    if (selectedProjects.length === 0) {
      output.error('At least one project must be selected.');
      return 1;
    }
  }

  if (selectedProjects.length > maxMicrofrontendsPerGroup) {
    output.error(
      `Cannot add more than ${maxMicrofrontendsPerGroup} projects to a group.`
    );
    return 1;
  }

  let defaultApp: Project;
  if (defaultAppFlag) {
    const found = selectedProjects.find(p => p.name === defaultAppFlag);
    if (!found) {
      output.error(
        `Default app "${defaultAppFlag}" must be one of the selected projects.`
      );
      return 1;
    }
    defaultApp = found;
  } else if (selectedProjects.length === 1) {
    defaultApp = selectedProjects[0];
  } else {
    const defaultAppId = await client.input.select({
      message: 'Select the default application:',
      choices: selectedProjects.map(p => ({ name: p.name, value: p.id })),
    });
    defaultApp = selectedProjects.find(p => p.id === defaultAppId)!;
  }

  let defaultRoute: string;
  if (defaultRouteFlag) {
    const validation = validateDefaultRoute(defaultRouteFlag);
    if (validation !== true) {
      output.error(validation);
      return 1;
    }
    defaultRoute = defaultRouteFlag;
  } else {
    defaultRoute = '/';
  }

  const otherProjects = selectedProjects.filter(p => p.id !== defaultApp.id);
  const otherApplications: { projectId: string; defaultRoute: string }[] = [];

  for (const project of otherProjects) {
    const route = await client.input.text({
      message: `Default route for "${project.name}":`,
      validate: validateDefaultRoute,
    });
    otherApplications.push({ projectId: project.id, defaultRoute: route });
  }

  const newProjectCount = selectedProjects.length;
  const totalAfter = existingMfeProjectCount + newProjectCount;

  output.log('');
  output.log(chalk.bold('Billing'));
  output.log(chalk.dim(`  ${chalk.bold('Team:')}     ${teamSlug}`));
  output.log(
    chalk.dim(
      `  ${chalk.bold('Adding:')}   ${newProjectCount} microfrontends project${newProjectCount > 1 ? 's' : ''}`
    )
  );

  let projectFee: string;
  if (totalAfter <= freeProjects) {
    projectFee =
      chalk.green('Free') + chalk.dim(` (first ${freeProjects} included)`);
  } else if (existingMfeProjectCount >= freeProjects) {
    projectFee =
      chalk.yellow(`$250.00/month x ${newProjectCount}`) +
      chalk.dim(` project${newProjectCount > 1 ? 's' : ''}`);
  } else {
    const freeRemaining = freeProjects - existingMfeProjectCount;
    const paidProjects = newProjectCount - freeRemaining;
    projectFee =
      chalk.green(`${freeRemaining} free`) +
      chalk.dim(', ') +
      chalk.yellow(`$250.00/month x ${paidProjects}`);
  }
  output.log(chalk.dim(`  ${chalk.bold('Project fee:')}  ${projectFee}`));
  output.log(
    chalk.dim(
      `  ${chalk.bold('Request fee:')}  ${chalk.yellow('$2.00')} per million microfrontends routed requests`
    )
  );
  output.log('');
  if (totalAfter <= freeProjects) {
    output.log(
      `This group is within the free tier, so no project fee will be charged to ${chalk.bold(teamSlug)}'s bill. Request fees still apply for microfrontends routed requests.`
    );
  } else {
    const newPaidProjects = Math.min(
      newProjectCount,
      totalAfter - freeProjects
    );
    output.log(
      `By proceeding, ${chalk.bold(teamSlug)} will be charged for ${newPaidProjects} additional paid project${newPaidProjects > 1 ? 's' : ''} on the team's monthly bill.`
    );
  }
  output.log('');

  const confirmed = await client.input.confirm(
    'Create microfrontends group?',
    true
  );
  if (!confirmed) {
    output.log('Aborted.');
    return 0;
  }

  const createStamp = stamp();
  output.spinner('Creating microfrontends group…');

  try {
    await client.fetch(`/v1/microfrontends/group?teamId=${team.id}`, {
      method: 'POST',
      body: {
        groupName,
        defaultApp: {
          projectId: defaultApp.id,
          defaultRoute,
        },
        otherApplications,
      },
    });
  } catch (error: unknown) {
    output.stopSpinner();
    if (isAPIError(error) && error.status === 403) {
      output.error(
        'You must be an Owner to create or modify microfrontends groups.'
      );
      return 1;
    }
    printError(error);
    return 1;
  }

  output.stopSpinner();

  const settingsUrl = `https://vercel.com/${teamSlug}/${defaultApp.name}/settings/microfrontends`;
  output.success(
    `Microfrontends group "${groupName}" created ${chalk.gray(createStamp())}`
  );
  output.log(
    `View microfrontends group: ${output.link(settingsUrl, settingsUrl, { fallback: false })}`
  );

  // If the default app is the linked project, offer to create microfrontends.json
  if (linkedProject.id === defaultApp.id) {
    const projectDir = repoRoot
      ? join(repoRoot, linkedProject.rootDirectory || '')
      : client.cwd;
    const configPath = join(projectDir, 'microfrontends.json');
    if (!existsSync(configPath)) {
      output.log('');
      output.log(
        `No changes to production traffic will take effect until a ${chalk.bold('microfrontends.json')} is added to the default app. This configuration file specifies the path routing for the microfrontends group.`
      );
      const shouldCreate =
        client.stdin.isTTY &&
        (await client.input.confirm('Create a microfrontends.json now?', true));
      if (shouldCreate) {
        const routingPaths: Record<string, string[]> = {};
        for (const project of otherProjects) {
          output.log(
            `Enter routing paths for ${chalk.bold(project.name)} (comma-separated, e.g. /docs, /docs/*)`
          );
          const pathsInput = await client.input.text({
            message: `Paths for ${project.name}:`,
            validate: (val: string) => {
              if (!val.trim()) {
                return 'At least one path is required';
              }
              const paths = val.split(',').map(p => p.trim());
              for (const p of paths) {
                const result = validateRoutingPath(p);
                if (result !== true) {
                  return `Invalid path "${p}": ${result}`;
                }
              }
              return true;
            },
          });
          routingPaths[project.name] = pathsInput.split(',').map(p => p.trim());
        }

        const productionAlias = defaultApp.targets?.production?.alias?.[0];
        const config = generateMicrofrontendsConfig(
          defaultApp.name,
          routingPaths,
          productionAlias
        );

        await writeFile(configPath, config + '\n', 'utf-8');
        output.success(`Created ${chalk.bold('microfrontends.json')}`);
        output.log(
          'Create a preview deployment to test microfrontends before deploying to production.'
        );
      }
    }
  } else {
    output.log(
      `Next step: Add a ${chalk.bold('microfrontends.json')} to your default app. See ${output.link('https://vercel.com/docs/microfrontends/path-routing', 'https://vercel.com/docs/microfrontends/path-routing', { fallback: false })}`
    );
  }

  return 0;
}

function generateMicrofrontendsConfig(
  defaultAppName: string,
  routingPaths: Record<string, string[]>,
  productionAlias?: string
): string {
  const fallback = productionAlias || '...your-production-domain.vercel.app';
  const applications: Record<string, unknown> = {
    [defaultAppName]: {
      development: {
        fallback,
      },
    },
  };
  for (const [name, paths] of Object.entries(routingPaths)) {
    applications[name] = {
      routing: [{ paths }],
    };
  }
  return JSON.stringify(
    { $schema: 'https://openapi.vercel.sh/microfrontends.json', applications },
    null,
    2
  );
}

function validateGroupName(
  name: string,
  existingGroups: MicrofrontendsGroupResponse[]
): true | string {
  if (!name || name.trim().length === 0) {
    return 'Group name cannot be empty.';
  }
  if (name.length > MAX_GROUP_NAME_LENGTH) {
    return `Group name must be ${MAX_GROUP_NAME_LENGTH} characters or less.`;
  }
  if (existingGroups.some(g => g.group.name === name)) {
    return `A group named "${name}" already exists.`;
  }
  return true;
}

function isProjectInMicrofrontendsGroup(
  project: Project,
  groups: MicrofrontendsGroupResponse[]
): boolean {
  return groups.some(g => g.projects.some(p => p.id === project.id));
}
