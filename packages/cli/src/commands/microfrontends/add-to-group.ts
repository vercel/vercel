import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import stamp from '../../util/output/stamp';
import { addToGroupSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import type { MicrofrontendsGroupResponse } from './types';
import {
  ensureMicrofrontendsContext,
  fetchMicrofrontendsGroups,
  validateDefaultRoute,
} from './utils';

export default async function addToGroup(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    addToGroupSubcommand.options
  );
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const context = await ensureMicrofrontendsContext(client);
  if (typeof context === 'number') {
    return context;
  }

  const { project, team } = context;
  const teamSlug = team.slug;

  const groupsResponse = await fetchMicrofrontendsGroups(client, team.id);

  const { groups, maxMicrofrontendsPerGroup } = groupsResponse;

  const existingGroup = groups.find(g =>
    g.projects.some(p => p.id === project.id)
  );
  if (existingGroup) {
    output.error(
      `Project "${project.name}" is already part of the microfrontends group "${existingGroup.group.name}". A project cannot be in more than one microfrontends group.`
    );
    return 1;
  }

  if (groups.length === 0) {
    output.error(
      'No microfrontends groups exist. Create one first with `vercel microfrontends create-group`.'
    );
    return 1;
  }

  const existingMfeProjectCount = groups.reduce(
    (count, g) => count + g.projects.length,
    0
  );
  const freeProjects = 2;
  const totalAfter = existingMfeProjectCount + 1;
  const plan = team.billing.plan;
  const isProTrialPlan =
    team.billing.plan === 'pro' && team.billing.status === 'trialing';
  const isLimitedPlan = isProTrialPlan || plan === 'hobby';

  if (isLimitedPlan && totalAfter > freeProjects) {
    const planName = isProTrialPlan ? 'Pro Trial' : 'Hobby';
    const url = `https://vercel.com/${teamSlug}/~/settings/billing`;
    output.log(
      `You've reached the microfrontends project limit for ${planName}. Upgrade to Pro to add more projects.`
    );
    output.log(`Upgrade: ${output.link(url, url, { fallback: false })}`);
    return 1;
  }

  output.log(
    `Adding project ${chalk.bold(project.name)} to a microfrontends group on ${chalk.bold(teamSlug)}.`
  );
  output.log('');

  const groupFlag = parsedArgs.flags['--group'] as string | undefined;
  const defaultRouteFlag = parsedArgs.flags['--default-route'] as
    | string
    | undefined;

  if (!client.stdin.isTTY) {
    output.error(
      'This command must be run interactively because it affects billing.'
    );
    return 1;
  }

  let selectedGroup: MicrofrontendsGroupResponse;
  if (groupFlag) {
    const found = groups.find(
      g => g.group.name === groupFlag || g.group.id === groupFlag
    );
    if (!found) {
      output.error(`Microfrontends group "${groupFlag}" not found.`);
      return 1;
    }
    selectedGroup = found;
  } else {
    const groupId = await client.input.select({
      message: 'Select a microfrontends group:',
      choices: groups.map(g => ({ name: g.group.name, value: g.group.id })),
    });
    selectedGroup = groups.find(g => g.group.id === groupId)!;
  }

  if (selectedGroup.projects.length >= maxMicrofrontendsPerGroup) {
    if (isLimitedPlan) {
      const planName = isProTrialPlan ? 'Pro Trial' : 'Hobby';
      const url = `https://vercel.com/${teamSlug}/~/settings/billing`;
      output.log(
        `You've reached the microfrontends project limit for ${planName}. Upgrade to Pro to add more projects.`
      );
      output.log(`Upgrade: ${output.link(url, url, { fallback: false })}`);
      return 1;
    }
    output.error(
      `Group "${selectedGroup.group.name}" has reached the maximum number of projects (${maxMicrofrontendsPerGroup}).`
    );
    return 1;
  }

  let defaultRoute: string | undefined;
  if (defaultRouteFlag) {
    const validation = validateDefaultRoute(defaultRouteFlag);
    if (validation !== true) {
      output.error(validation);
      return 1;
    }
    defaultRoute = defaultRouteFlag;
  } else if (client.stdin.isTTY) {
    output.log(
      'Specify a default route for the project. This path will be used for deployment screenshots and the default link to the project.'
    );
    defaultRoute = await client.input.text({
      message: 'Default route (e.g. /docs):',
      validate: validateDefaultRoute,
    });
  }

  output.log('');
  output.log(chalk.bold('Billing'));
  output.log(chalk.dim(`  ${chalk.bold('Team:')}  ${teamSlug}`));

  let projectFee: string;
  if (totalAfter <= freeProjects) {
    projectFee =
      chalk.green('Free') + chalk.dim(` (first ${freeProjects} included)`);
  } else if (existingMfeProjectCount >= freeProjects) {
    projectFee = chalk.yellow('$250.00/month');
  } else {
    projectFee =
      chalk.yellow('$250.00/month') +
      chalk.dim(` (${freeProjects} free projects used)`);
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
      `Adding "${project.name}" is within the free tier, so no project fee will be charged to ${chalk.bold(teamSlug)}'s bill. Request fees still apply for microfrontends routed requests.`
    );
  } else {
    output.log(
      `By proceeding, ${chalk.bold(teamSlug)} will be charged for this project on the team's monthly bill.`
    );
  }
  output.log('');

  const addConfirmed = await client.input.confirm(
    `Add "${project.name}" to "${selectedGroup.group.name}"?`,
    true
  );
  if (!addConfirmed) {
    output.log('Aborted.');
    return 0;
  }

  const addStamp = stamp();
  output.spinner('Adding project to microfrontends group…');

  try {
    await client.fetch(
      `/v10/projects/${project.id}/microfrontends?teamId=${teamSlug}`,
      {
        method: 'PATCH',
        body: {
          microfrontendsGroupId: selectedGroup.group.id,
          isDefaultApp: false,
          defaultRoute,
          enabled: true,
        },
      }
    );
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

  const settingsUrl = `https://vercel.com/${teamSlug}/${project.name}/settings/microfrontends`;
  output.success(
    `Project "${project.name}" added to group "${selectedGroup.group.name}" ${chalk.gray(addStamp())}`
  );
  output.log(
    `View microfrontends group: ${output.link(settingsUrl, settingsUrl, { fallback: false })}`
  );
  output.log(
    `Next step: Add routing paths for this project in your microfrontends.json configuration. See ${output.link('https://vercel.com/docs/microfrontends/path-routing', 'https://vercel.com/docs/microfrontends/path-routing', { fallback: false })}`
  );

  return 0;
}
