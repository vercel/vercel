import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  v0Subcommand,
  SUPPORTED_V0_PLANS,
  V0_PLAN_LABELS,
  V0_PLAN_TO_SLUG,
  type V0Plan,
} from './command';
import output from '../../output-manager';
import getScope from '../../util/get-scope';
import { getCommandName } from '../../util/pkg-name';
import stamp from '../../util/output/stamp';
import { createPurchase } from '../../util/buy/create-purchase';
import { handlePurchaseError } from '../../util/buy/handle-purchase-error';
import { validateJsonOutput } from '../../util/output-format';

export default async function v0(client: Client, argv: string[]) {
  const flagsSpecification = getFlagsSpecification(v0Subcommand.options);
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
  const [plan] = args;

  // Validate plan argument
  if (!plan) {
    output.error(
      `Missing plan. Supported plans: ${SUPPORTED_V0_PLANS.join(', ')}`
    );
    output.log(`Run ${getCommandName('buy v0 --help')} for usage.`);
    return 1;
  }

  if (!SUPPORTED_V0_PLANS.includes(plan as V0Plan)) {
    output.error(
      `Invalid plan "${plan}". Supported plans: ${SUPPORTED_V0_PLANS.join(', ')}`
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

  const typedPlan = plan as V0Plan;
  const label = V0_PLAN_LABELS[typedPlan];
  const planSlug = V0_PLAN_TO_SLUG[typedPlan];
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
        `Purchase ${chalk.bold(label)} for team ${chalk.bold(contextName)}?`,
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
      type: 'subscription',
      planSlug,
    });

    output.stopSpinner();

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            plan: typedPlan,
            planSlug,
            team: contextName,
            purchaseIntent: result.purchaseIntent,
          },
          null,
          2
        )}\n`
      );
    } else {
      output.success(
        `Purchased ${chalk.bold(label)} for ${chalk.bold(contextName)} ${purchaseStamp()}`
      );
      if (result.purchaseIntent) {
        output.debug(`Purchase intent: ${result.purchaseIntent.id}`);
      }
    }

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    return handlePurchaseError(err, contextName);
  }
}
