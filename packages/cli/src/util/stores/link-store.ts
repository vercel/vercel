import chalk from 'chalk';

import { ProjectLinked } from '@vercel-internals/types';

import Client from '../client';
import { STORAGE_API_PATH } from '../../commands/stores';
import confirm from '../input/confirm';
import { getCommandName } from '../pkg-name';

export async function linkStore(options: {
  name: string;
  id: string;
  client: Client;
  link: ProjectLinked;
}) {
  const {
    client,
    name,
    id,
    link: { project, org },
  } = options;

  const shouldLink = await confirm(
    client,
    `Should the ${chalk.bold(name)} store be linked to the ${chalk.bold(
      project.name
    )} project?`,
    true
  );

  if (!shouldLink) {
    return false;
  }

  try {
    client.output.spinner('linking store');

    await client.fetch(`${STORAGE_API_PATH}/stores/${id}/connections`, {
      accountId: org.id,
      method: 'POST',
      body: {
        projectId: project.id,
        envVarEnvironments: ['production', 'preview', 'development'],
      },
    });
  } catch {
    return false;
  }

  client.output.success(
    `Linked blob store ${chalk.bold(name)} to project ${chalk.bold(
      project.name
    )}\n`
  );

  client.output.print(
    `Run ${getCommandName(
      'env pull'
    )} to download the newly created env variables.`
  );

  return true;
}
