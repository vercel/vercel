import chalk from 'chalk';
import type Client from '../client';
import { ensureLink } from '../link/ensure-link';
import { getCommandName } from '../pkg-name';
import output from '../../output-manager';
import stamp from '../output/stamp';
import { confirmAddon } from './confirm-addon';
import { handleCustomEnvironmentPurchaseError } from './handle-custom-environment-purchase-error';
import {
  CUSTOM_ENVIRONMENT_EXAMPLE_PACK_COUNT,
  CUSTOM_ENVIRONMENTS_PER_PACK,
  CUSTOM_ENVIRONMENT_PACK_MONTHLY_PRICE,
} from './custom-environment-addon';

type ProjectCustomEnvironmentsSettings = {
  packSize: number;
  baseline: number;
  purchasedAmount: number;
  minPurchasedAmount: number;
  maxPurchasedAmount: number;
  effectiveLimit: number;
  environmentsUsed: number;
};

export type PurchaseCustomEnvironmentCapacityOptions = {
  packs: number;
  yes: boolean;
  asJson?: boolean;
  projectName?: string;
  commandName: string;
};

export async function purchaseCustomEnvironmentCapacity(
  client: Client,
  {
    packs,
    yes,
    asJson = false,
    projectName,
    commandName,
  }: PurchaseCustomEnvironmentCapacityOptions
): Promise<number> {
  const { cwd } = client;

  const link = await ensureLink(commandName, client, cwd, {
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
    const minEnvironments = minPacks * packSize;
    const maxEnvironments = maxPacks * packSize;
    output.error(
      `Packs must be between ${minPacks} and ${maxPacks} for this project (${minEnvironments}-${maxEnvironments} purchased environments).`
    );
    return 1;
  }

  if (packs === purchasedPacks) {
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify({ projectId, purchasedAmount: settings.purchasedAmount })}\n`
      );
      return 0;
    }
    output.log(
      `Project ${chalk.bold(projectNameResolved)} already has ${chalk.bold(packs)} custom environment pack${packs === 1 ? '' : 's'} purchased.`
    );
    return 0;
  }

  const purchasedAmount = packs * packSize;
  const isIncreasing = packs > purchasedPacks;

  const confirmation = await confirmAddon(client, {
    yes,
    asJson,
    summary: [
      ['Add-on', 'Custom environments'],
      ['Team', link.org.slug],
      ['Project', projectNameResolved],
      [
        'Standard price',
        `$${CUSTOM_ENVIRONMENT_PACK_MONTHLY_PRICE} per pack per month (USD)`,
      ],
      [
        'Monthly cost',
        `$${purchasedPacks * CUSTOM_ENVIRONMENT_PACK_MONTHLY_PRICE} → $${packs * CUSTOM_ENVIRONMENT_PACK_MONTHLY_PRICE}`,
      ],
      [
        'Pricing',
        'https://vercel.com/docs/deployments/environments#pricing-and-limits',
      ],
    ],
    prompt: `${isIncreasing ? 'Purchase' : 'Reduce to'} ${chalk.bold(packs)} custom environment pack${packs === 1 ? '' : 's'} (${purchasedAmount} environments) for project ${chalk.bold(projectNameResolved)}?`,
  });
  if (confirmation !== 'confirmed') {
    return confirmation === 'required' ? 1 : 0;
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
        `${JSON.stringify({ projectId, purchasedAmount: result.purchasedAmount })}\n`
      );
      return 0;
    }
    output.success(
      `Updated custom environment capacity for ${chalk.bold(projectNameResolved)} to ${chalk.bold(packs)} pack${packs === 1 ? '' : 's'} (${result.purchasedAmount} environments) ${purchaseStamp()}`
    );

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    return handleCustomEnvironmentPurchaseError(err);
  }
}

export function validateCustomEnvironmentPacks(
  packsStr: string | undefined
): { packs: number } | { error: string; usage?: string } {
  if (!packsStr) {
    return {
      error:
        'Missing packs. Specify the number of custom environment packs to purchase.',
      usage: `Example: ${getCommandName(`buy addon custom-environment ${CUSTOM_ENVIRONMENT_EXAMPLE_PACK_COUNT}`)} — each pack adds ${CUSTOM_ENVIRONMENTS_PER_PACK} environments.`,
    };
  }

  const packs = Number(packsStr);
  if (!Number.isInteger(packs)) {
    return {
      error: `Invalid packs "${packsStr}". Please specify a whole number.`,
    };
  }
  if (packs < 0) {
    return {
      error: `Invalid packs "${packsStr}". Please specify a non-negative number.`,
    };
  }

  return { packs };
}
