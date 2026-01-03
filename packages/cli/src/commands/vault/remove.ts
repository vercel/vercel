import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { removeSubcommand } from './command';
import { emoji, prependEmoji } from '../../util/emoji';
import stamp from '../../util/output/stamp';

export default async function remove(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags: opts } = parsedArgs;

  if (args.length === 0) {
    output.error('Please specify at least one secret key to remove');
    return 1;
  }

  const secretKeys = args;
  const isGlobal = opts['--global'];
  const environment = opts['--environment'];
  let projectId = '';
  let teamId: string;

  if (isGlobal) {
    // Global secrets don't need a project
    if (!client.config.currentTeam) {
      output.error('No team selected. Run `vercel switch` to select a team.');
      return 1;
    }
    teamId = client.config.currentTeam;
    projectId = '';
  } else {
    // Project-specific secret
    const link = await getLinkedProject(client);
    if (link.status === 'error') {
      return link.exitCode;
    } else if (link.status === 'not_linked') {
      output.error(
        `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
      );
      return 1;
    }

    client.config.currentTeam =
      link.org.type === 'team' ? link.org.id : undefined;
    teamId = link.org.id;
    projectId = opts['--project'] || link.project.id;
  }

  const envParam = environment ? environment.toUpperCase() : 'PRODUCTION';
  const queryParams = new URLSearchParams();
  queryParams.set('projectId', projectId);
  queryParams.set('environment', envParam);

  // Show what we're about to remove
  const keyCount = secretKeys.length;
  output.log(
    `Removing ${keyCount} secret${keyCount === 1 ? '' : 's'} from Vault...`
  );

  // Delete each secret
  try {
    for (const key of secretKeys) {
      const url = `/v1/vault/${teamId}/metadata/${key}?${queryParams.toString()}`;

      output.debug(`DELETE ${url}`);

      await client.fetch(url, {
        method: 'DELETE',
      });
    }

    output.log('');
    output.success(
      `${prependEmoji(
        `${keyCount} secret${keyCount === 1 ? '' : 's'} removed ${stamp()}`,
        emoji('success')
      )}`
    );
    output.log('');

    return 0;
  } catch (error) {
    output.debug(`Error response: ${JSON.stringify(error)}`);
    if (error.status === 404) {
      output.error(`Secret(s) not found in Vault.`);
      return 1;
    }
    output.error(`Failed to remove secrets: ${error.message}`);
    return 1;
  }
}
