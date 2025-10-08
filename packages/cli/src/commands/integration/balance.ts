import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { getBalanceInformation } from '../../util/integration/fetch-installation-prepayment-info';
import { getFirstConfiguration } from '../../util/integration/fetch-marketplace-integrations';
import type {
  CreditWithAmount,
  InstallationBalancesAndThresholds,
  PrepaymentCreditThreshold,
} from '../../util/integration/types';
import { IntegrationBalanceTelemetryClient } from '../../util/telemetry/commands/integration/balance';
import type { Resource } from '../../util/integration-resource/types';
import { getResources } from '../../util/integration-resource/get-resources';

export async function balance(client: Client, args: string[]) {
  const telemetry = new IntegrationBalanceTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (args.length > 1) {
    output.error('Cannot specify more than one integration at a time');
    return 1;
  }

  const integrationSlug = args[0];

  if (!integrationSlug) {
    output.error('You must pass an integration slug');
    return 1;
  }

  const { team } = await getScope(client);

  if (!team) {
    output.error('Team not found.');
    return 1;
  }

  const installation = await getBalanceInstallationId(
    client,
    integrationSlug,
    telemetry
  );
  if (installation === undefined) {
    return 1;
  }
  const installationId = installation.id;

  const resources = await getResourcesForInstallation(
    client,
    installationId,
    team
  );
  if (resources === undefined) {
    return 1;
  }

  const prepaymentInfo = await getBalanceInformation(
    client,
    installationId,
    team
  );
  if (prepaymentInfo === undefined) {
    return 1;
  }

  outputBalanceInformation(prepaymentInfo, resources, integrationSlug);

  return 0;
}

async function getBalanceInstallationId(
  client: Client,
  integrationSlug: string,
  telemetry: IntegrationBalanceTelemetryClient
) {
  let knownIntegrationSlug = false;
  output.spinner('Retrieving installation…', 500);
  try {
    const installation = await getFirstConfiguration(client, integrationSlug);

    if (!installation) {
      output.stopSpinner();
      output.error('No installations found for this integration');
      return;
    }

    knownIntegrationSlug = true;
    return installation;
  } catch (error) {
    output.stopSpinner();
    output.error(`Failed to fetch installations: ${(error as Error).message}`);
    return;
  } finally {
    telemetry.trackCliArgumentIntegration(
      integrationSlug,
      knownIntegrationSlug
    );
  }
}

async function getResourcesForInstallation(
  client: Client,
  installationId: string,
  team: { id: string }
) {
  output.spinner('Retrieving resources…', 500);
  try {
    const resources = (await getResources(client, team.id)).filter(
      resource =>
        resource.product?.integrationConfigurationId === installationId
    );

    output.stopSpinner();
    return resources;
  } catch (error) {
    output.stopSpinner();
    output.error(`Failed to fetch resources: ${(error as Error).message}`);
    return;
  }
}

function outputBalanceInformation(
  prepaymentInfo: InstallationBalancesAndThresholds,
  resources: Resource[],
  integrationSlug: string
) {
  const hasBalances = prepaymentInfo.balances.length > 0;
  const hasThresholds = prepaymentInfo.thresholds.length > 0;

  if (!hasBalances) {
    output.log('No balances found for this integration');
  }

  if (!hasThresholds) {
    output.log('No thresholds found for this integration');
  }

  if (!hasBalances && !hasThresholds) {
    return 0;
  }

  const mappings: Record<
    string,
    {
      balance?: CreditWithAmount;
      threshold?: PrepaymentCreditThreshold;
      resourceName: string;
    }
  > = {};
  for (const balance of prepaymentInfo.balances) {
    const resourceName = balance.resourceId
      ? (resources.find(r => r.externalResourceId === balance.resourceId)
          ?.name ?? balance.resourceId)
      : 'installation';
    mappings[balance.resourceId ?? 'installation'] = { balance, resourceName };
  }
  for (const threshold of prepaymentInfo.thresholds) {
    const mapping = mappings[threshold.resourceId ?? 'installation'];
    if (mapping) {
      mapping.threshold = threshold;
    } else {
      const resourceName = threshold.resourceId
        ? (resources.find(r => r.externalResourceId === threshold.resourceId)
            ?.name ?? threshold.resourceId)
        : 'installation';
      mappings[resourceName] = { threshold, resourceName };
    }
  }

  output.log(
    `${chalk.bold(`Balances and thresholds for ${integrationSlug}`)}:`
  );

  for (const key in mappings) {
    const mapping = mappings[key];
    const name = mapping.resourceName;
    const balance = mapping.balance;
    const threshold = mapping.threshold;

    output.log(`● ${name}`);
    if (balance) {
      output.log(
        `    Balance: ${formattedCurrency(balance.currencyValueInCents)}`
      );
    }
    if (threshold) {
      output.log(
        `    Threshold: Spend ${formattedCurrency(threshold.purchaseAmountInCents)} if balance goes below ${formattedCurrency(threshold.minimumAmountInCents)}`
      );
    }
  }
}

function formattedCurrency(amountInCents: number) {
  return Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountInCents / 100);
}
