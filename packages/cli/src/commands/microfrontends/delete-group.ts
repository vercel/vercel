import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import stamp from '../../util/output/stamp';
import { deleteGroupSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import type { MicrofrontendsGroupResponse } from './types';
import {
  ensureMicrofrontendsContext,
  fetchMicrofrontendsGroups,
} from './utils';

export default async function deleteGroup(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    deleteGroupSubcommand.options
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

  const { project: linkedProject, team } = context;

  const groupsResponse = await fetchMicrofrontendsGroups(client, team.id);

  const { groups } = groupsResponse;

  if (groups.length === 0) {
    output.error('No microfrontends groups exist. There is nothing to delete.');
    return 1;
  }

  const groupFlag = parsedArgs.flags['--group'] as string | undefined;

  if (!client.stdin.isTTY && !groupFlag) {
    output.error(
      'Missing required flag --group. Use --group to specify the microfrontends group, or run interactively.'
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
    // If the linked project is the default app for a group, suggest that group first
    const linkedGroup = groups.find(g =>
      g.projects.some(
        p => p.id === linkedProject.id && p.microfrontends?.isDefaultApp
      )
    );

    if (linkedGroup && client.stdin.isTTY) {
      const useLinkedGroup = await client.input.confirm(
        `Delete microfrontends group "${linkedGroup.group.name}" (linked to ${chalk.bold(linkedProject.name)})?`,
        true
      );
      if (useLinkedGroup) {
        selectedGroup = linkedGroup;
      } else if (groups.length === 1) {
        output.log('Aborted.');
        return 0;
      } else {
        const remaining = groups.filter(
          g => g.group.id !== linkedGroup.group.id
        );
        const groupId = await client.input.select({
          message: 'Select a microfrontends group to delete:',
          choices: remaining.map(g => ({
            name: g.group.name,
            value: g.group.id,
          })),
        });
        selectedGroup = groups.find(g => g.group.id === groupId)!;
      }
    } else {
      const groupId = await client.input.select({
        message: 'Select a microfrontends group to delete:',
        choices: groups.map(g => ({
          name: g.group.name,
          value: g.group.id,
        })),
      });
      selectedGroup = groups.find(g => g.group.id === groupId)!;
    }
  }

  const groupName = selectedGroup.group.name;
  const projectCount = selectedGroup.projects.length;

  output.log('');
  output.log(
    `This will delete the microfrontends group ${chalk.bold(groupName)} and all of its settings.`
  );
  if (projectCount > 0) {
    output.log(
      `${projectCount} project${projectCount > 1 ? 's' : ''} will be removed from the group.`
    );
  }
  output.log(chalk.red('This action is not reversible.'));
  output.log('');

  if (!client.stdin.isTTY) {
    output.error('This command must be run interactively to confirm deletion.');
    return 1;
  }

  const typedName = await client.input.text({
    message: `Type ${chalk.bold(groupName)} to confirm deletion:`,
    validate: (val: string) => {
      if (val !== groupName) {
        return `You must type "${groupName}" to confirm.`;
      }
      return true;
    },
  });

  if (typedName !== groupName) {
    output.log('Aborted.');
    return 0;
  }

  const deleteStamp = stamp();
  output.spinner('Deleting microfrontends group…');

  try {
    await client.fetch(
      `/v2/teams/${team.id}/microfrontends/${selectedGroup.group.id}?teamId=${team.id}`,
      {
        method: 'DELETE',
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
    `Microfrontends group "${groupName}" deleted ${chalk.gray(deleteStamp())}`
  );

  return 0;
}
