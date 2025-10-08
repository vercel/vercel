import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getResources } from '../../util/integration-resource/get-resources';
import { IntegrationResourceCreateThresholdTelemetryClient } from '../../util/telemetry/commands/integration-resource/create-threshold';
import { createThresholdSubcommand } from './command';
import getScope from '../../util/get-scope';
import { getBalanceInformation } from '../../util/integration/fetch-installation-prepayment-info';
import { updateThreshold } from '../../util/integration-resource/update-threshold';
import { updateInstallationThreshold } from '../../util/integration/update-installation-threshold';
import type {
  CreditWithAmount,
  InstallationBalancesAndThresholds,
  PrepaymentCreditThreshold,
} from '../../util/integration/types';
import type { Resource } from '../../util/integration-resource/types';

export async function createThreshold(client: Client) {
  const telemetry = new IntegrationResourceCreateThresholdTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(
    createThresholdSubcommand.options
  );

  try {
    parsedArguments = parseArguments(client.argv.slice(3), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  // parse arguments
  let args: ReturnType<typeof parseCreateThresholdArguments>;

  try {
    args = parseCreateThresholdArguments(parsedArguments.args, telemetry);
  } catch (error: unknown) {
    output.error((error as Error).message);
    return 1;
  }

  const skipConfirmWithYes = parsedArguments.flags['--yes'];
  telemetry.trackCliFlagYes(skipConfirmWithYes);

  const { resourceName, minimum, spend, limit } = args;

  // Fetch Team
  const { team } = await getScope(client);
  if (!team) {
    output.error('Team not found.');
    return 1;
  }

  // Fetch Resource
  output.spinner('Retrieving resource…', 500);
  const resources = await getResources(client, team.id);
  const targetedResource = resources.find(
    resource => resource.name === resourceName
  );
  output.stopSpinner();

  // Assert resource is valid
  if (!targetedResource) {
    output.log(`The resource ${chalk.bold(resourceName)} was not found.`);
    return 0;
  }

  if (!targetedResource.product?.integrationConfigurationId) {
    output.error(
      `The resource ${chalk.bold(resourceName)} does not have an integration configuration.`
    );
    return 1;
  }

  if (targetedResource.billingPlan?.type !== 'prepayment') {
    output.error(
      `The resource ${chalk.bold(resourceName)} is not a prepayment-based resource.`
    );
    return 1;
  }

  // Assert spend is within billing plan limits
  const minimumSpend =
    parseFloat(targetedResource.billingPlan.minimumAmount ?? '0.50') * 100;
  if (minimumSpend > spend) {
    output.error(
      `The spend amount $${spend / 100} is below your billing plan's minimum amount of $${minimumSpend / 100}.`
    );
    return 1;
  }

  const maximumSpend =
    parseFloat(targetedResource.billingPlan.maximumAmount ?? '1000000') * 100;
  if (
    targetedResource.billingPlan.maximumAmount !== undefined &&
    maximumSpend < spend
  ) {
    output.error(
      `The spend amount $${spend / 100} is above your billing plan's maximum amount of $${maximumSpend / 100}.`
    );
    return 1;
  }

  // Fetch prepayment info
  const prepaymentInfo = await getBalanceInformation(
    client,
    targetedResource.product.integrationConfigurationId,
    team
  );
  if (prepaymentInfo === undefined) {
    return 1;
  }

  if (targetedResource.billingPlan.scope !== 'resource') {
    output.log(
      `The resource ${chalk.bold(resourceName)} uses an installation-level balance.`
    );

    return await updateThresholdForInstallation({
      client,
      resource: targetedResource,
      prepaymentInfo,
      minimum,
      spend,
      limit,
      skipConfirmWithYes: Boolean(skipConfirmWithYes),
    });
  }

  return await updateThresholdForResource({
    client,
    resource: targetedResource,
    prepaymentInfo,
    minimum,
    spend,
    limit,
    skipConfirmWithYes: Boolean(skipConfirmWithYes),
  });
}

function parseCreateThresholdArguments(
  passedArgs: string[],
  telemetry: IntegrationResourceCreateThresholdTelemetryClient
) {
  if (passedArgs.length < 5) {
    throw new Error('Missing arguments. See `--help` for details.');
  }
  if (passedArgs.length > 5) {
    throw new Error('Too many arguments. See `--help` for details.');
  }

  const args = passedArgs.slice(1, 5);

  telemetry.trackCliArgumentResource(args[0]);
  telemetry.trackCliArgumentMinimum(args[1]);
  telemetry.trackCliArgumentSpend(args[2]);
  telemetry.trackCliArgumentLimit(args[3]);

  const resourceName = args[0];
  const minimum = Number.parseFloat(args[1]) * 100;
  const spend = Number.parseInt(args[2]) * 100;
  const limit = Number.parseInt(args[3]) * 100;
  if (isNaN(minimum)) {
    throw new Error(
      'Minimum is an invalid number format. Spend must be a positive number (ex. "5.75")'
    );
  }
  if (isNaN(spend)) {
    throw new Error(
      'Spend is an invalid number format. Spend must be a positive number (ex. "10.99").'
    );
  }
  if (isNaN(limit)) {
    throw new Error(
      'Limit is an invalid number format. Limit must be a positive number (ex. "1000").'
    );
  }

  if (minimum < 0) {
    throw new Error('Minimum cannot be negative.');
  }
  if (spend < 0) {
    throw new Error('Spend cannot be negative.');
  }
  if (limit < 0) {
    throw new Error('Limit cannot be negative.');
  }
  if (minimum > spend) {
    throw new Error('Minimum cannot be greater than spend.');
  }
  if (minimum > limit) {
    throw new Error('Minimum cannot be greater than limit.');
  }
  if (limit < spend) {
    throw new Error('Limit cannot be less than spend.');
  }

  return { resourceName, minimum, spend, limit };
}

async function updateThresholdForResource(props: {
  client: Client;
  resource: Resource;
  prepaymentInfo: InstallationBalancesAndThresholds;
  minimum: number;
  spend: number;
  limit: number;
  skipConfirmWithYes: boolean;
}) {
  const existingThreshold = props.prepaymentInfo.thresholds.find(
    threshold => threshold.resourceId === props.resource.externalResourceId
  );
  const existingBalance = props.prepaymentInfo.balances.find(
    balance => balance.resourceId === props.resource.externalResourceId
  );

  return handleUpdateThreshold({
    client: props.client,
    resource: props.resource,
    minimum: props.minimum,
    spend: props.spend,
    limit: props.limit,
    existingThreshold,
    existingBalance,
    skipConfirmWithYes: props.skipConfirmWithYes,
    isInstallationLevel: false,
  });
}

async function updateThresholdForInstallation(props: {
  client: Client;
  resource: Resource;
  prepaymentInfo: InstallationBalancesAndThresholds;
  minimum: number;
  spend: number;
  limit: number;
  skipConfirmWithYes: boolean;
}) {
  const existingThreshold = props.prepaymentInfo.thresholds.find(
    threshold => threshold.resourceId === undefined
  );
  const existingBalance = props.prepaymentInfo.balances.find(
    balance => balance.resourceId === undefined
  );

  return handleUpdateThreshold({
    client: props.client,
    resource: props.resource,
    minimum: props.minimum,
    spend: props.spend,
    limit: props.limit,
    existingThreshold,
    existingBalance,
    skipConfirmWithYes: props.skipConfirmWithYes,
    isInstallationLevel: true,
  });
}

async function handleUpdateThreshold(props: {
  client: Client;
  resource: Resource;
  minimum: number;
  spend: number;
  limit: number;
  existingThreshold?: PrepaymentCreditThreshold;
  existingBalance?: CreditWithAmount;
  skipConfirmWithYes: boolean;
  isInstallationLevel: boolean;
}) {
  if (props.resource.billingPlan?.type !== 'prepayment') {
    output.log(
      `The resource ${chalk.bold(props.resource.name)} is not a prepayment-based resource.`
    );
    return 0;
  }

  if (!props.resource.product?.integrationConfigurationId) {
    output.log(
      `The resource ${chalk.bold(props.resource.name)} does not have an integration configuration.`
    );
    return 0;
  }

  const entityTextReference = props.isInstallationLevel
    ? `installation ${chalk.bold(props.resource.product?.name)}`
    : `resource ${chalk.bold(props.resource.name)}`;
  if (props.existingThreshold) {
    const shouldOverwriteThreshold =
      props.skipConfirmWithYes ||
      (await props.client.input.confirm(
        `The ${entityTextReference} already has a threshold. (minimum: $${props.existingThreshold.minimumAmountInCents / 100}, spend: $${props.existingThreshold.purchaseAmountInCents / 100}, limit: ${props.existingThreshold.maximumAmountPerPeriodInCents ? `$${props.existingThreshold.maximumAmountPerPeriodInCents / 100}` : 'none set'}). Do you want to overwrite it?`,
        true
      ));

    if (!shouldOverwriteThreshold) {
      output.log('Aborting…');
      return 0;
    }
  }

  if (
    props.existingBalance &&
    props.existingBalance.currencyValueInCents < props.minimum
  ) {
    const shouldOverwriteBalance =
      props.skipConfirmWithYes ||
      (await props.client.input.confirm(
        `The minimum threshold is higher than the current balance of $${props.existingBalance.currencyValueInCents / 100}. Are you sure?`,
        true
      ));

    if (!shouldOverwriteBalance) {
      output.log('Aborting…');
      return 0;
    }
  }

  const thresholdCreationConfirmed =
    props.skipConfirmWithYes ||
    (await props.client.input.confirm(
      `Are you sure you want to create a threshold for the ${entityTextReference} with minimum $${props.minimum / 100}, spend $${props.spend / 100}, and limit $${props.limit / 100}?`,
      true
    ));
  if (!thresholdCreationConfirmed) {
    output.log('Aborting…');
    return 0;
  }

  const metadata = JSON.parse(props.existingThreshold?.metadata ?? '{}');

  output.spinner('Creating threshold…', 500);
  if (props.isInstallationLevel) {
    await updateInstallationThreshold(
      props.client,
      props.resource.product.integrationConfigurationId,
      props.resource.billingPlan.id,
      props.minimum,
      props.spend,
      props.limit,
      metadata
    );
  } else {
    await updateThreshold(
      props.client,
      props.resource.product.integrationConfigurationId,
      props.resource.id,
      props.resource.billingPlan.id,
      props.minimum,
      props.spend,
      props.limit,
      metadata
    );
  }
  output.stopSpinner();
  output.success(`Threshold for ${entityTextReference} created successfully.`);

  return 0;
}
