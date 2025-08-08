import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { help } from '../help';
import { unlinkCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { unlinkProject } from '../../util/projects/unlink';
import { emoji, prependEmoji } from '../../util/emoji';

export default async function unlink(client: Client) {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(unlinkCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(help(unlinkCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const yes = !!parsedArgs.flags['--yes'];

  // Check if the project is currently linked
  const linkResult = await getLinkedProject(client);
  if (linkResult.status === 'error') {
    return linkResult.exitCode;
  } else if (linkResult.status === 'not_linked') {
    output.error('This directory is not linked to a Vercel Project.');
    return 1;
  }

  const { org, project } = linkResult;
  const projectName = `${org.slug}/${project.name}`;

  // Confirm unlinking unless --yes flag is used
  if (!yes) {
    const shouldUnlink = await client.input.confirm(
      `Are you sure you want to unlink this directory from ${projectName}?`,
      true
    );

    if (!shouldUnlink) {
      output.log('Canceled.');
      return 0;
    }
  }

  // Perform the unlink operation
  const unlinkResult = await unlinkProject(client, client.cwd);

  if (!unlinkResult.success) {
    output.error('Failed to unlink project.');
    return 1;
  }

  output.print(
    prependEmoji(
      `Unlinked from ${projectName} (removed .vercel)`,
      emoji('success')
    ) + '\n'
  );

  return 0;
}
