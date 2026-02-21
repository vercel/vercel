import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { proSubcommand } from './command';
import output from '../../output-manager';
import getScope from '../../util/get-scope';

export default async function pro(client: Client, argv: string[]) {
  const flagsSpecification = getFlagsSpecification(proSubcommand.options);
  let parsedArgs;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  // Ensure we have a team scope
  const { team, contextName } = await getScope(client);

  if (!team) {
    output.error(
      'This command must be run with a team scope. Use --scope to specify a team.'
    );
    return 1;
  }

  output.log(`Upgrading team ${contextName} to Vercel Pro...`);

  // TODO: Implement Pro subscription purchase flow when API is available
  output.error('Pro subscription purchase is not yet available via the CLI.');

  return 1;
}
