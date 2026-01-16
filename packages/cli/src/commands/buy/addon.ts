import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { addonSubcommand } from './command';
import output from '../../output-manager';
import getScope from '../../util/get-scope';

export default async function addon(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addonSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const { args } = parsedArgs;
  const [addonName] = args;

  // Ensure we have a team scope
  const { team, contextName } = await getScope(client);

  if (!team) {
    output.error(
      'This command must be run with a team scope. Use --scope to specify a team.'
    );
    return 1;
  }

  if (addonName) {
    output.log(`Purchasing addon "${addonName}" for team ${contextName}...`);
  } else {
    output.log(`Browsing available addons for team ${contextName}...`);
  }

  // TODO: Implement addon purchase flow when API is available
  output.warn('Addon purchase is not yet available. API integration pending.');

  return 0;
}
