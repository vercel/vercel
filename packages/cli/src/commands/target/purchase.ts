import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { purchaseSubcommand, targetCommand } from './command';
import output from '../../output-manager';
import { ensureLink } from '../../util/link/ensure-link';
import { getCommandName } from '../../util/pkg-name';
import stamp from '../../util/output/stamp';
import { validateJsonOutput } from '../../util/output-format';
import { handleCustomEnvironmentPurchaseError } from '../../util/buy/handle-custom-environment-purchase-error';

type ProjectCustomEnvironmentsSettings = {
  packSize: number;
  baseline: number;
  purchasedAmount: number;
  minPurchasedAmount: number;
  maxPurchasedAmount: number;
  effectiveLimit: number;
  environmentsUsed: number;
};

export default async function purchase(client: Client, argv: string[]) {
  const { cwd } = client;
  const flagsSpecification = getFlagsSpecification(purchaseSubcommand.options);
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

  const { args, flags } = parsedArgs;
  const [packsStr] = args;

  if (!packsStr) {
    output.error(
      'Missing packs argument. Specify the number of packs to purchase.'
    );
    output.log(`Run ${getCommandName('target purchase --help')} for usage.`);
    return 1;
  }

  const packs = Number(packsStr);
  if (!Number.isInteger(packs)) {
    output.error(`Invalid packs "${packsStr}". Please specify a whole number.`);
    return 1;
  }
  if (packs < 0) {
    output.error(
      `Invalid packs "${packsStr}". Please specify a non-negative number.`
    );
    return 1;
  }

  const yes = flags['--yes'];
  const projectName = flags['--project'];
  const link = await ensureLink(targetCommand.name, client, cwd, {
    autoConfirm: yes,
    projectName,
    failIfNotFound: Boolean(projectName),
  });
  if (typeof link === 'number') {
    return link;
  }

  const projectId = link.project.id;
  const projectNameResolved = link.project.name;

  output.spinner('Fetching custom environment settings');
  let settings: ProjectCustomEnvironmentsSettings;
  try {
    settings = await client.fetch<ProjectCustomEnvironmentsSettings>(
      `/v1/projects/custom-environments/settings?projectId=${encodeURIComponent(projectId)}`,
      { accountId: link.org.id }
    );
  } catch (err: unknown) {
    output.stopSpinner();
    return handleCustomEnvironmentPurchaseError(err);
  }
  output.stopSpinner();

  const { packSize } = settings;
  const purchasedPacks = settings.purchasedAmount / packSize;
  const minPacks = settings.minPurchasedAmount / packSize;
  const maxPacks = settings.maxPurchasedAmount / packSize;

  if (packs < minPacks || packs > maxPacks) {
    output.error(
      `Packs must be between ${minPacks} and ${maxPacks} for this project.`
    );
    return 1;
  }

  if (packs === purchasedPacks) {
    output.log(
      `Project ${chalk.bold(projectNameResolved)} already has ${chalk.bold(packs)} custom environment pack${packs === 1 ? '' : 's'} purchased.`
    );
    return 0;
  }

  const purchasedAmount = packs * packSize;
  const isIncreasing = packs > purchasedPacks;

  if (!yes) {
    if (!client.stdin.isTTY) {
      output.error(
        'Confirmation required. Use --yes to skip the confirmation prompt in non-interactive mode.'
      );
      return 1;
    }
    if (
      !(await client.input.confirm(
        `${isIncreasing ? 'Purchase' : 'Reduce to'} ${chalk.bold(packs)} custom environment pack${packs === 1 ? '' : 's'} (${purchasedAmount} environments) for project ${chalk.bold(projectNameResolved)}?`,
        false
      ))
    ) {
      return 0;
    }
  }

  const purchaseStamp = stamp();
  output.spinner('Updating custom environment capacity');

  try {
    const result = await client.fetch<{ purchasedAmount: number }>(
      `/v1/projects/custom-environments/settings?projectId=${encodeURIComponent(projectId)}`,
      {
        method: 'POST',
        body: { purchasedAmount },
        accountId: link.org.id,
      }
    );

    output.stopSpinner();

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            project: projectNameResolved,
            packs,
            purchasedAmount: result.purchasedAmount,
            packSize,
          },
          null,
          2
        )}\n`
      );
    } else {
      output.success(
        `Updated custom environment capacity for ${chalk.bold(projectNameResolved)} to ${chalk.bold(packs)} pack${packs === 1 ? '' : 's'} (${result.purchasedAmount} environments) ${purchaseStamp()}`
      );
    }

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    return handleCustomEnvironmentPurchaseError(err);
  }
}
