import chalk from 'chalk';
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
import stamp from '../../util/output/stamp';
import { createPurchase } from '../../util/buy/create-purchase';
import { handlePurchaseError } from '../../util/buy/handle-purchase-error';
import { validateJsonOutput } from '../../util/output-format';

const MAX_CREDIT_PURCHASE_AMOUNT = 1_000;

export default async function credits(client: Client, argv: string[]) {
  const flagsSpecification = getFlagsSpecification(creditsSubcommand.options);
  let parsedArgs;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

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

  const amount = Number(amountStr);
  if (!Number.isInteger(amount)) {
    output.error(
      `Invalid amount "${amountStr}". Please specify a whole number (in dollars).`
    );
    return 1;
  }
  if (amount <= 0) {
    output.error(
      `Invalid amount "${amountStr}". Please specify a positive amount in dollars.`
    );
    return 1;
  }
  // Safety check to prevent accidental large purchases via CLI
  if (amount > MAX_CREDIT_PURCHASE_AMOUNT) {
    output.error(
      `Amount cannot exceed $${MAX_CREDIT_PURCHASE_AMOUNT.toLocaleString()} per purchase via CLI.`
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
  const yes = parsedArgs.flags['--yes'];

  // Confirm purchase
  if (!yes) {
    if (!client.stdin.isTTY) {
      output.error(
        'Confirmation required. Use --yes to skip the confirmation prompt in non-interactive mode.'
      );
      return 1;
    }
    if (
      !(await client.input.confirm(
        `Purchase ${chalk.bold(`$${amount}`)} of ${label} credits for team ${chalk.bold(contextName)}?`,
        false
      ))
    ) {
      return 0;
    }
  }

  const purchaseStamp = stamp();
  output.spinner('Processing purchase');

  try {
    const result = await createPurchase(client, {
      type: 'credits',
      creditType: typedCreditType,
      amount,
    });

    output.stopSpinner();

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            creditType: typedCreditType,
            amount,
            team: contextName,
            purchaseIntent: result.purchaseIntent,
          },
          null,
          2
        )}\n`
      );
    } else {
      output.success(
        `Purchased ${chalk.bold(`$${amount}`)} of ${label} credits for ${chalk.bold(contextName)} ${purchaseStamp()}`
      );
      output.debug(`Purchase intent: ${result.purchaseIntent.id}`);
    }

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    return handlePurchaseError(err, contextName);
  }
}
