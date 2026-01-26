import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  creditsSubcommand,
  SUPPORTED_CREDIT_CURRENCIES,
  type CreditCurrency,
} from './command';
import output from '../../output-manager';
import getScope from '../../util/get-scope';
import { getCommandName } from '../../util/pkg-name';

export default async function credits(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(creditsSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const { args } = parsedArgs;
  const [currency, amountStr] = args;

  // Validate currency argument
  if (!currency) {
    output.error(
      `Missing currency. Supported currencies: ${SUPPORTED_CREDIT_CURRENCIES.join(', ')}`
    );
    output.log(`Run ${getCommandName('buy credits --help')} for usage.`);
    return 1;
  }

  if (!SUPPORTED_CREDIT_CURRENCIES.includes(currency as CreditCurrency)) {
    output.error(
      `Invalid currency "${currency}". Supported currencies: ${SUPPORTED_CREDIT_CURRENCIES.join(', ')}`
    );
    return 1;
  }

  // Validate amount argument
  if (!amountStr) {
    output.error('Missing amount. Please specify the amount in dollars.');
    output.log(`Run ${getCommandName('buy credits --help')} for usage.`);
    return 1;
  }

  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount <= 0) {
    output.error(
      `Invalid amount "${amountStr}". Please specify a positive integer amount in dollars.`
    );
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

  output.log(
    `Purchasing $${amount} of ${currency} credits for team ${contextName}...`
  );

  // TODO: Implement credits purchase API call
  output.warn(
    'Credits purchase is not yet available. API integration pending.'
  );

  return 0;
}
