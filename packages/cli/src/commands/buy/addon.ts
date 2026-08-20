import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { addonSubcommand, SUPPORTED_ADDON_NAMES } from './command';
import output from '../../output-manager';
import { getCommandName } from '../../util/pkg-name';
import { isCustomEnvironmentAddonAlias } from '../../util/buy/custom-environment-addon';
import {
  purchaseCustomEnvironmentCapacity,
  validateCustomEnvironmentPacks,
} from '../../util/buy/purchase-custom-environment-capacity';
import { validateJsonOutput } from '../../util/output-format';
import { isObservabilityPlusAddonAlias } from '../../util/buy/observability-plus-addon';
import { purchaseObservabilityPlus } from '../../util/buy/purchase-observability-plus';

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

  if (addonName && isObservabilityPlusAddonAlias(addonName)) {
    if (flags['--project'] !== undefined) {
      output.error(
        "--project isn't supported for Observability Plus because it is enabled for a team. Use --scope <team> to select the team."
      );
      return 1;
    }

    if (quantityStr !== undefined) {
      output.error(
        `Observability Plus does not accept a quantity. Run ${getCommandName('buy addon observability-plus')} without one.`
      );
      return 1;
    }

    const formatResult = validateJsonOutput(parsedArgs.flags);
    if (!formatResult.valid) {
      output.error(formatResult.error);
      return 1;
    }

    return purchaseObservabilityPlus(client, {
      yes: Boolean(flags['--yes']),
      asJson: formatResult.jsonOutput,
    });
  }

  if (!addonName) {
    output.error(
      `Missing addon name. Supported addons: ${SUPPORTED_ADDON_NAMES.join(', ')}`
    );
    output.log(`Run ${getCommandName('buy addon --help')} for usage.`);
    return 1;
  }

  output.error(
    `Invalid addon "${addonName}". Supported addons: ${SUPPORTED_ADDON_NAMES.join(', ')}.`
  );
  return 1;
}
