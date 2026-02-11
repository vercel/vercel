import chalk from 'chalk';
import { errorToString } from '@vercel/error-utils';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  creditsSubcommand,
  SUPPORTED_CREDIT_TYPES,
  CREDIT_TYPE_LABELS,
  type CreditType,
} from './command';
import output from '../../output-manager';
import getScope from '../../util/get-scope';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import stamp from '../../util/output/stamp';

type BuyResponse = {
  purchaseIntent: {
    id: string;
    status: string;
  };
};

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
  const [creditType, amountStr] = args;

  // Validate credit type argument
  if (!creditType) {
    output.error(
      `Missing credit type. Supported types: ${SUPPORTED_CREDIT_TYPES.join(', ')}`
    );
    output.log(`Run ${getCommandName('buy credits --help')} for usage.`);
    return 1;
  }

  if (!SUPPORTED_CREDIT_TYPES.includes(creditType as CreditType)) {
    output.error(
      `Invalid credit type "${creditType}". Supported types: ${SUPPORTED_CREDIT_TYPES.join(', ')}`
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

  const typedCreditType = creditType as CreditType;
  const label = CREDIT_TYPE_LABELS[typedCreditType];

  // Confirm purchase
  if (
    !(await client.input.confirm(
      `Purchase ${chalk.bold(`$${amount}`)} of ${label} credits for team ${chalk.bold(contextName)}?`,
      false
    ))
  ) {
    return 0;
  }

  const purchaseStamp = stamp();
  output.spinner('Processing purchase');

  try {
    const result = await client.fetch<BuyResponse>('/v1/billing/buy', {
      method: 'POST',
      body: {
        item: {
          type: 'credits',
          creditType: typedCreditType,
          amount,
        },
      },
    });

    output.stopSpinner();
    output.success(
      `Purchased ${chalk.bold(`$${amount}`)} of ${label} credits for ${chalk.bold(contextName)} ${purchaseStamp()}`
    );
    output.debug(`Purchase intent: ${result.purchaseIntent.id}`);

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();

    if (isAPIError(err)) {
      if (err.code === 'missing_stripe_customer') {
        output.error(
          'Your team does not have a payment method on file. Please add one in the Vercel dashboard.'
        );
        return 1;
      }
      if (err.status === 402 || err.code === 'payment_failed') {
        output.error(
          'Payment failed. Please check the payment method on file for your team.'
        );
        return 1;
      }
      if (
        err.code === 'purchase_create_failed' ||
        err.code === 'purchase_confirm_failed' ||
        err.code === 'purchase_complete_failed'
      ) {
        output.error(
          'An error occurred while processing your purchase. Please try again later.'
        );
        output.debug(`Error code: ${err.code}`);
        return 1;
      }
    }

    output.error(
      'An unexpected error occurred while purchasing credits. Please try again later.'
    );
    output.debug(`Server response: ${errorToString(err)}`);
    return 1;
  }
}
