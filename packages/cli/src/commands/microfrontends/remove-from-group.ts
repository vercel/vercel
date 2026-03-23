import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import stamp from '../../util/output/stamp';
import { removeFromGroupSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import {
  ensureMicrofrontendsContext,
  fetchMicrofrontendsGroups,
} from './utils';
import {
  buildCommandWithYes,
  outputActionRequired,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';

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
  const context = await ensureMicrofrontendsContext(client, { autoConfirm });
  if (typeof context === 'number') {
    return context;
  }

  const { project, team } = context;
  const teamSlug = team.slug;

  const groupsResponse = await fetchMicrofrontendsGroups(client, team.id);

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

  if (client.nonInteractive && !autoConfirm) {
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message: `Removing "${project.name}" from microfrontends group "${projectGroup.group.name}" requires confirmation. Use --yes to confirm.`,
        next: [
          {
            command: buildCommandWithYes(client.argv),
            when: 'to confirm removal',
          },
        ],
      },
      1
    );
    return 1;
  }

  output.log(
    `Removing project ${chalk.bold(project.name)} from microfrontends group ${chalk.bold(projectGroup.group.name)} on ${chalk.bold(teamSlug)}.`
  );
  output.log(
    `After removal, "${project.name}" will no longer be a child app in the group and will not be part of the composed application.`
  );

  // Warn and confirm if the microfrontends.json config still references this project
  const config = projectGroup.config;
  const isReferencedInConfig = !!config?.applications?.[project.name];
  if (isReferencedInConfig) {
    output.log('');
    output.warn(
      `The microfrontends.json configuration still contains an entry for "${project.name}".`
    );
    output.warn(
      `Removing this project will cause other microfrontends projects in the group to fail deploying until the configuration is updated.`
    );

    if (!autoConfirm) {
      if (!client.stdin.isTTY) {
        output.error(
          'Cannot remove a project that is still referenced in microfrontends.json in non-interactive mode.'
        );
        return 1;
      }
      output.log('');
      const configConfirmed = await client.input.confirm(
        `Remove "${project.name}" even though it is still referenced in microfrontends.json?`,
        false
      );
      if (!configConfirmed) {
        output.log('Aborted.');
        return 0;
      }
    }
  }

  output.log('');

  if (!autoConfirm) {
    if (!client.stdin.isTTY) {
      output.error(
        'This command must be run interactively to confirm removal.'
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
  } catch (error) {
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
  if (isReferencedInConfig) {
    output.log(
      `Remember to remove "${project.name}" from your microfrontends.json configuration.`
    );
  }

  return 0;
}
