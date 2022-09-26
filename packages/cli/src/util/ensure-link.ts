import { Org, Project } from '../types';
import Client from './client';
import setupAndLink from './link/setup-and-link';
import param from './output/param';
import { getCommandName } from './pkg-name';
import { getLinkedProject } from './projects/link';

type LinkResult = {
  org: Org;
  project: Project;
};

export async function ensureLink(
  commandName: string,
  client: Client,
  cwd: string,
  yes: boolean
): Promise<LinkResult | number> {
  let link = await getLinkedProject(client, cwd);
  if (link.status === 'not_linked') {
    link = await setupAndLink(client, cwd, {
      autoConfirm: yes,
      successEmoji: 'link',
      setupMsg: 'Set up',
    });

    if (link.status === 'not_linked') {
      // User aborted project linking questions
      return 0;
    }
  }

  if (link.status === 'error') {
    if (link.reason === 'HEADLESS') {
      client.output.error(
        `Command ${getCommandName(
          commandName
        )} requires confirmation. Use option ${param('--yes')} to confirm.`
      );
    }
    return link.exitCode;
  }

  return { org: link.org, project: link.project };
}
