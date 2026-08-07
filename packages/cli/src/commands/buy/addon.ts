import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  addonSubcommand,
  SUPPORTED_ADDON_ALIASES,
  ADDON_LABELS,
  type AddonAlias,
} from './command';
import output from '../../output-manager';
import getScope from '../../util/get-scope';
import { getCommandName } from '../../util/pkg-name';
import stamp from '../../util/output/stamp';
import { createPurchase } from '../../util/buy/create-purchase';
import { handlePurchaseError } from '../../util/buy/handle-purchase-error';
import { isCustomEnvironmentAddonAlias } from '../../util/buy/custom-environment-addon';
import {
  purchaseCustomEnvironmentCapacity,
  validateCustomEnvironmentPacks,
} from '../../util/buy/purchase-custom-environment-capacity';
import { validateJsonOutput } from '../../util/output-format';

export default async function addon(client: Client, argv: string[]) {
  const flagsSpecification = getFlagsSpecification(addonSubcommand.options);
  let parsedArgs;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [addonName, quantityStr] = args;

  if (addonName && isCustomEnvironmentAddonAlias(addonName)) {
    const packsResult = validateCustomEnvironmentPacks(quantityStr);
    if ('error' in packsResult) {
      output.error(packsResult.error);
      if (packsResult.usage) {
        output.log(packsResult.usage);
      }
      return 1;
    }

    const project = flags['--project'];
    return purchaseCustomEnvironmentCapacity(client, {
      packs: packsResult.packs,
      yes: Boolean(flags['--yes']),
      projectName: typeof project === 'string' ? project : undefined,
      commandName: 'buy',
    });
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  // Validate addon name argument
  if (!addonName) {
    output.error(
      `Missing addon name. Supported addons: ${SUPPORTED_ADDON_ALIASES.join(', ')}`
    );
    output.log(`Run ${getCommandName('buy addon --help')} for usage.`);
    return 1;
  }

  if (!SUPPORTED_ADDON_ALIASES.includes(addonName as AddonAlias)) {
    output.error(
      `Invalid addon "${addonName}". Supported addons: ${SUPPORTED_ADDON_ALIASES.join(', ')}.`
    );
    return 1;
  }

  // Validate quantity argument
  if (!quantityStr) {
    output.error('Missing quantity. Please specify how many to purchase.');
    output.log(`Run ${getCommandName('buy addon --help')} for usage.`);
    return 1;
  }

  const quantity = Number(quantityStr);
  if (!Number.isInteger(quantity)) {
    output.error(
      `Invalid quantity "${quantityStr}". Please specify a whole number.`
    );
    return 1;
  }
  if (quantity <= 0) {
    output.error(
      `Invalid quantity "${quantityStr}". Please specify a positive number.`
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

  const typedAddonAlias = addonName as AddonAlias;
  const label = ADDON_LABELS[typedAddonAlias];
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
        `Purchase ${chalk.bold(quantity)} ${label} addon${quantity === 1 ? '' : 's'} for team ${chalk.bold(contextName)}?`,
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
      type: 'addon',
      productAlias: typedAddonAlias,
      quantity,
    });

    output.stopSpinner();

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            productAlias: typedAddonAlias,
            quantity,
            team: contextName,
            subscriptionIntent: result.subscriptionIntent,
          },
          null,
          2
        )}\n`
      );
    } else {
      output.success(
        `Purchased ${chalk.bold(quantity)} ${label} addon${quantity === 1 ? '' : 's'} for ${chalk.bold(contextName)} ${purchaseStamp()}`
      );
      if (result.subscriptionIntent) {
        output.debug(`Subscription intent: ${result.subscriptionIntent.id}`);
      }
    }

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    return handlePurchaseError(err, contextName, {
      openBrowser: !!client.stdout.isTTY,
    });
  }
}
