import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { v0Subcommand } from './command';
import output from '../../output-manager';
import getScope from '../../util/get-scope';

export default async function v0(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(v0Subcommand.options);
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

  output.log(`Purchasing v0 subscription for team ${contextName}...`);

  // TODO: Implement v0 subscription purchase flow when API is available
  output.warn('v0 subscription purchase is not yet available.');

  return 0;
}
