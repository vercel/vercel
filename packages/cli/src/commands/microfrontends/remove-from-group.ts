import chalk from 'chalk';
import output from '../../output-manager';
import getScope from '../../util/get-scope';
import type Client from '../../util/client';
import { ensureLink } from '../../util/link/ensure-link';
import stamp from '../../util/output/stamp';
import { removeFromGroupSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import type { MicrofrontendsGroupsResponse } from './types';

export default async function removeFromGroup(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    removeFromGroupSubcommand.options
  );
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const autoConfirm = !!parsedArgs.flags['--yes'];
  const link = await ensureLink('microfrontends', client, client.cwd, {
    autoConfirm,
  });
  if (typeof link === 'number') {
    return link;
  }

  const { project, org } = link;

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

  output.spinner('Fetching microfrontends groups…');
  const groupsResponse = await client.fetch<MicrofrontendsGroupsResponse>(
    `/v1/microfrontends/groups?teamId=${team.id}`,
    { method: 'GET' }
  );
  output.stopSpinner();

  const { groups } = groupsResponse;

  const projectGroup = groups.find(g =>
    g.projects.some(p => p.id === project.id)
  );

  if (!projectGroup) {
    output.error(
      `Project "${project.name}" is not part of any microfrontends group.`
    );
    return 1;
  }

  // Default apps cannot be removed from a group
  const projectEntry = projectGroup.projects.find(p => p.id === project.id);
  if (projectEntry?.microfrontends?.isDefaultApp) {
    output.error(
      `Project "${project.name}" is the default app for group "${projectGroup.group.name}" and cannot be removed. To remove it, first change the default app in the dashboard.`
    );
    return 1;
  }

  output.log(
    `Removing project ${chalk.bold(project.name)} from microfrontends group ${chalk.bold(projectGroup.group.name)} on ${chalk.bold(teamSlug)}.`
  );
  output.log(
    `After removal, "${project.name}" will no longer be a child app in the group and will not be part of the composed application.`
  );

  // Warn if the microfrontends.json config still references this project
  const config = projectGroup.config;
  if (config?.applications?.[project.name]) {
    output.log('');
    output.warn(
      `The microfrontends.json configuration still contains an entry for "${project.name}". You will need to remove it from the configuration after this operation.`
    );
    output.log(
      chalk.dim(
        `  Related config to remove:\n${JSON.stringify({ [project.name]: config.applications[project.name] }, null, 2).replace(/^/gm, '  ')}`
      )
    );
  }

  output.log('');

  if (!autoConfirm) {
    if (!client.stdin.isTTY) {
      output.error(
        'Confirmation required. Use --yes to skip confirmation in non-interactive mode.'
      );
      return 1;
    }
    const confirmed = await client.input.confirm(
      `Remove "${project.name}" from "${projectGroup.group.name}"?`,
      false
    );
    if (!confirmed) {
      output.log('Aborted.');
      return 0;
    }
  }

  const removeStamp = stamp();
  output.spinner('Removing project from microfrontends group…');

  try {
    await client.fetch(
      `/v10/projects/${project.id}/microfrontends?teamId=${teamSlug}`,
      {
        method: 'PATCH',
        body: {
          enabled: false,
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

  output.success(
    `Project "${project.name}" removed from group "${projectGroup.group.name}" ${chalk.gray(removeStamp())}`
  );
  if (config?.applications?.[project.name]) {
    output.log(
      `Remember to remove "${project.name}" from your microfrontends.json configuration.`
    );
  }

  return 0;
}
