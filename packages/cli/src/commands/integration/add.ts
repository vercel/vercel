import chalk from 'chalk';
import open from 'open';
import type Client from '../../util/client';
import formatTable from '../../util/format-table';
import getScope from '../../util/get-scope';
import list from '../../util/input/list';
import indent from '../../util/output/indent';
import {
  getLinkedProjectField,
  postProvisionSetup,
  VALID_ENVIRONMENTS,
  validateEnvironments,
  type PostProvisionOptions,
} from '../../util/integration/post-provision-setup';
import type {
  BillingPlan,
  Integration,
  IntegrationInstallation,
  IntegrationProduct,
  Metadata,
} from '../../util/integration/types';
import { createMetadataWizard, type MetadataWizard } from './wizard';
import { provisionStoreResource } from '../../util/integration/provision-store-resource';
import { resolveResourceName } from '../../util/integration/generate-resource-name';
import {
  parseMetadataFlags,
  validateAndPrintRequiredMetadata,
  validateRequiredMetadata,
} from '../../util/integration/parse-metadata';
import { addAutoProvision } from './add-auto-provision';
import { fetchBillingPlans } from '../../util/integration/fetch-billing-plans';
import { fetchInstallations } from '../../util/integration/fetch-installations';
import { fetchIntegrationWithTelemetry } from '../../util/integration/fetch-integration';
import { selectProduct } from '../../util/integration/select-product';
import output from '../../output-manager';
import { IntegrationAddTelemetryClient } from '../../util/telemetry/commands/integration/add';
import { createAuthorization } from '../../util/integration/create-authorization';
import sleep from '../../util/sleep';
import { fetchAuthorization } from '../../util/integration/fetch-authorization';

import type { IntegrationAddFlags } from './command';

type AddOptions = PostProvisionOptions;

export async function add(
  client: Client,
  args: string[],
  flags: IntegrationAddFlags
) {
  const resourceNameArg = flags['--name'];
  const metadataFlags = flags['--metadata'];
  const billingPlanId = flags['--plan'];
  const options: AddOptions = {
    noConnect: flags['--no-connect'],
    noEnvPull: flags['--no-env-pull'],
    environments: flags['--environment'],
  };
  if (args.length > 1) {
    output.error('Cannot install more than one integration at a time');
    return 1;
  }

  const rawArg = args[0];

  if (!rawArg) {
    output.error('You must pass an integration slug');
    return 1;
  }

  // Parse optional product slug from "integration/product" syntax
  let integrationSlug: string;
  let productSlug: string | undefined;
  const slashIndex = rawArg.indexOf('/');
  if (slashIndex !== -1) {
    integrationSlug = rawArg.substring(0, slashIndex);
    productSlug = rawArg.substring(slashIndex + 1);
    if (!integrationSlug || !productSlug) {
      output.error(
        'Invalid format. Expected: <integration-name>/<product-slug>'
      );
      return 1;
    }
  } else {
    integrationSlug = rawArg;
  }

  // Validate --environment values early (before any network requests)
  if (options.environments?.length) {
    const envValidation = validateEnvironments(options.environments);
    if (!envValidation.valid) {
      output.error(
        `Invalid environment value: ${envValidation.invalid.map(e => `"${e}"`).join(', ')}. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`
      );
      return 1;
    }
  }

  // Note: Resource name validation happens after product selection
  // to apply product-specific validation rules

  // Auto-provision: completely separate code path (self-contained telemetry)
  if (process.env.FF_AUTO_PROVISION_INSTALL === '1') {
    return await addAutoProvision(client, integrationSlug, resourceNameArg, {
      productSlug,
      metadata: metadataFlags,
      billingPlanId,
      noConnect: options.noConnect,
      noEnvPull: options.noEnvPull,
      environments: options.environments,
    });
  }

  const telemetry = new IntegrationAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  telemetry.trackCliOptionName(resourceNameArg);
  telemetry.trackCliOptionMetadata(metadataFlags);
  telemetry.trackCliOptionPlan(billingPlanId);
  telemetry.trackCliFlagNoConnect(options.noConnect);
  telemetry.trackCliFlagNoEnvPull(options.noEnvPull);
  telemetry.trackCliOptionEnvironment(options.environments);

  const { contextName, team } = await getScope(client);

  if (!team) {
    output.error('Team not found');
    return 1;
  }

  const integration = await fetchIntegrationWithTelemetry(
    client,
    integrationSlug,
    telemetry
  );
  if (!integration) {
    return 1;
  }

  if (!integration.products?.length) {
    output.error(
      `Integration "${integrationSlug}" is not a Marketplace integration`
    );
    return 1;
  }

  const [productResult, installationsResult] = await Promise.allSettled([
    selectProduct(client, integration.products, productSlug),
    fetchInstallations(client, integration),
  ]);

  if (productResult.status === 'rejected') {
    output.error(
      `Failed to select product: ${(productResult.reason as Error).message}`
    );
    return 1;
  }

  if (!productResult.value) {
    if (!productSlug) {
      // Only print generic error when no slug was specified.
      // When a slug was provided, selectProduct already printed a specific error.
      output.error('Product not found');
    }
    return 1;
  }

  if (installationsResult.status === 'rejected') {
    output.error(
      `Failed to get integration installations: ${installationsResult.reason}`
    );
    return 1;
  }

  const product = productResult.value;
  const installations = installationsResult.value;

  const teamInstallations = installations.filter(
    install =>
      install.ownerId === team.id && install.installationType === 'marketplace'
  );

  if (teamInstallations.length > 1) {
    output.error(
      `Found more than one existing installation of ${integration.name}. Please contact Vercel Support at https://vercel.com/help`
    );
    return 1;
  }

  const installation = teamInstallations[0] as
    | IntegrationInstallation
    | undefined;

  output.log(
    `Installing ${chalk.bold(product.name)} by ${chalk.bold(integration.name)} under ${chalk.bold(contextName)}`
  );

  const metadataSchema = product.metadataSchema;
  const metadataWizard = createMetadataWizard(metadataSchema);

  // Resolve and validate resource name
  const nameResult = resolveResourceName(product.slug, resourceNameArg);
  if ('error' in nameResult) {
    output.error(nameResult.error);
    return 1;
  }
  const { resourceName } = nameResult;

  // Validate --metadata flags early (fail fast, even if CLI provisioning not supported)
  let parsedMetadata: Metadata | undefined;
  if (metadataFlags?.length) {
    const { metadata: parsed, errors } = parseMetadataFlags(
      metadataFlags,
      metadataSchema
    );
    if (errors.length) {
      for (const error of errors) {
        output.error(error);
      }
      return 1;
    }
    parsedMetadata = parsed;
  }

  // The provisioning via cli is possible when
  // 1. The integration was installed once (terms have been accepted)
  // 2. EITHER metadata is provided via flags OR wizard is supported
  // 3. The selected billing plan is supported (handled at time of billing plan selection)
  const provisionResourceViaCLIIsSupported =
    installation && (parsedMetadata || metadataWizard.isSupported);

  if (!provisionResourceViaCLIIsSupported) {
    const projectLink = await getLinkedProjectField(
      client,
      options.noConnect,
      'id'
    );
    if (projectLink.exitCode) {
      return projectLink.exitCode;
    }

    const openInWeb = await client.input.confirm(
      !installation
        ? 'Terms have not been accepted. Open Vercel Dashboard?'
        : 'This resource must be provisioned through the Web UI. Open Vercel Dashboard?',
      true
    );

    if (openInWeb) {
      provisionResourceViaWebUI(
        team.id,
        integration.id,
        product.id,
        projectLink.value,
        resourceName,
        parsedMetadata,
        billingPlanId
      );
    }

    return 1;
  }

  return await provisionResourceViaCLI(
    client,
    team.id,
    contextName,
    integration,
    installation,
    product,
    metadataWizard,
    resourceName,
    parsedMetadata,
    billingPlanId,
    options
  );
}

function provisionResourceViaWebUI(
  teamId: string,
  integrationId: string,
  productId: string,
  projectId?: string,
  resourceName?: string,
  metadata?: Metadata,
  billingPlanId?: string
) {
  const url = new URL('/api/marketplace/cli', 'https://vercel.com');
  url.searchParams.set('teamId', teamId);
  url.searchParams.set('integrationId', integrationId);
  url.searchParams.set('productId', productId);
  url.searchParams.set('source', 'cli');
  if (projectId) {
    url.searchParams.set('projectId', projectId);
  }
  if (resourceName) {
    url.searchParams.set('defaultResourceName', resourceName);
  }
  if (metadata && Object.keys(metadata).length > 0) {
    url.searchParams.set('metadata', JSON.stringify(metadata));
  }
  if (billingPlanId) {
    url.searchParams.set('planId', billingPlanId);
  }
  url.searchParams.set('cmd', 'add');
  output.print('Opening the Vercel Dashboard to continue the installation...');
  output.debug(`Opening URL: ${url.href}`);
  open(url.href).catch((err: unknown) =>
    output.debug(`Failed to open browser: ${err}`)
  );
}

async function provisionResourceViaCLI(
  client: Client,
  teamId: string,
  contextName: string,
  integration: Integration,
  installation: IntegrationInstallation,
  product: IntegrationProduct,
  metadataWizard: MetadataWizard,
  name: string,
  parsedMetadata?: Metadata,
  billingPlanId?: string,
  options: AddOptions = {}
) {
  // Get metadata from flags, wizard, or hybrid
  let metadata: Metadata;
  if (parsedMetadata) {
    if (client.stdin.isTTY && metadataWizard.isSupported) {
      // TTY with supported wizard: run wizard, pre-filling with flag values
      metadata = await metadataWizard.run(client, parsedMetadata);
    } else {
      // Non-TTY or unsupported wizard: all required fields must come from flags
      if (
        !validateAndPrintRequiredMetadata(
          parsedMetadata,
          product.metadataSchema
        )
      ) {
        return 1;
      }
      metadata = parsedMetadata;
    }
  } else if (!client.stdin.isTTY) {
    // Non-TTY without metadata: check if required fields need user input
    if (validateRequiredMetadata({}, product.metadataSchema).length > 0) {
      output.error(
        "Metadata is required in non-interactive mode. Use --metadata KEY=VALUE flags. Run 'vercel integration add <name> --help' to see available keys."
      );
      return 1;
    }
    // No required fields need user input — proceed with empty metadata
    metadata = {};
  } else {
    // TTY without metadata: run full wizard
    metadata = await metadataWizard.run(client);
  }

  let billingPlans: BillingPlan[] | undefined;
  try {
    const billingPlansResponse = await fetchBillingPlans(
      client,
      integration,
      product,
      metadata
    );
    billingPlans = billingPlansResponse.plans;
  } catch (error) {
    output.error(`Failed to get billing plans: ${(error as Error).message}`);
    return 1;
  }

  const enabledBillingPlans = billingPlans.filter(plan => !plan.disabled);

  if (!enabledBillingPlans.length) {
    output.error('No billing plans available');
    return 1;
  }

  let billingPlan: BillingPlan | undefined;

  if (billingPlanId) {
    billingPlan = enabledBillingPlans.find(plan => plan.id === billingPlanId);
    if (!billingPlan) {
      output.error(
        `Billing plan "${billingPlanId}" not found. Available plans: ${enabledBillingPlans.map(p => p.id).join(', ')}`
      );
      return 1;
    }
  } else {
    billingPlan = await selectBillingPlan(client, enabledBillingPlans);
  }

  if (!billingPlan) {
    output.error('No billing plan selected');
    return 1;
  }

  if (billingPlan.type !== 'subscription') {
    // offer to open the web UI to continue the resource provisioning
    const projectLink = await getLinkedProjectField(
      client,
      options.noConnect,
      'id'
    );
    if (projectLink.exitCode) {
      return projectLink.exitCode;
    }

    const openInWeb = await client.input.confirm(
      'You have selected a plan that cannot be provisioned through the CLI. Open Vercel Dashboard?',
      true
    );

    if (openInWeb) {
      provisionResourceViaWebUI(
        teamId,
        integration.id,
        product.id,
        projectLink.value,
        name,
        metadata,
        billingPlanId
      );
    }

    return 1;
  }

  const confirmed = await confirmProductSelection(
    client,
    product,
    name,
    metadata,
    billingPlan
  );

  if (!confirmed) {
    return 1;
  }

  try {
    const authorizationId = await getAuthorizationId(
      client,
      teamId,
      installation,
      product,
      metadata,
      billingPlan
    );

    return await provisionStorageProduct(
      client,
      product,
      installation,
      name,
      metadata,
      billingPlan,
      authorizationId,
      contextName,
      options
    );
  } catch (error) {
    output.error((error as Error).message);
    return 1;
  }
}

async function selectBillingPlan(client: Client, billingPlans: BillingPlan[]) {
  const billingPlanId = await list(client, {
    message: 'Choose a billing plan',
    separator: true,
    choices: billingPlans.map(plan => {
      const body = [plan.description];

      if (plan.type !== 'subscription') {
        body.push(
          'This plan is not subscription-based. Selecting it will prompt you to use the Vercel Dashboard.'
        );
      }

      if (plan.details?.length) {
        const detailsTable = formatTable(
          ['', ''],
          ['l', 'r'],
          [
            {
              name: 'Details',
              rows: plan.details.map(detail => [
                detail.label,
                detail.value || '-',
              ]),
            },
          ]
        );

        body.push(detailsTable);
      }

      if (plan.highlightedDetails?.length) {
        const hightlightedDetailsTable = formatTable(
          ['', ''],
          ['l', 'r'],
          [
            {
              name: 'More Details',
              rows: plan.highlightedDetails.map(detail => [
                detail.label,
                detail.value || '-',
              ]),
            },
          ]
        );

        body.push(hightlightedDetailsTable);
      }

      let planName = plan.name;
      if (plan.cost) {
        planName += ` ${plan.cost}`;
      }

      return {
        name: [planName, '', indent(body.join('\n'), 4)].join('\n'),
        value: plan.id,
        short: planName,
        disabled: plan.disabled,
      };
    }),
    pageSize: 1000,
  });

  return billingPlans.find(plan => plan.id === billingPlanId);
}

async function confirmProductSelection(
  client: Client,
  product: IntegrationProduct,
  name: string,
  metadata: Metadata,
  billingPlan: BillingPlan
) {
  output.print('Selected product:\n');
  output.print(`${chalk.dim(`- ${chalk.bold('Name:')} ${name}`)}\n`);
  for (const [key, value] of Object.entries(metadata)) {
    output.print(
      `${chalk.dim(`- ${chalk.bold(`${product.metadataSchema.properties[key]['ui:label']}:`)} ${value}`)}\n`
    );
  }
  output.print(
    `${chalk.dim(`- ${chalk.bold('Plan:')} ${billingPlan.name}`)}\n`
  );

  return client.input.confirm('Confirm selection?', true);
}

async function getAuthorizationId(
  client: Client,
  teamId: string,
  installation: IntegrationInstallation,
  product: IntegrationProduct,
  metadata: Metadata,
  billingPlan: BillingPlan
): Promise<string> {
  output.spinner('Validating payment...', 250);
  const originalAuthorizationState = await createAuthorization(
    client,
    installation.integrationId,
    installation.id,
    product.id,
    billingPlan.id,
    metadata
  );

  if (!originalAuthorizationState.authorization) {
    output.stopSpinner();
    throw new Error(
      'Failed to get an authorization state. If the problem persists, please contact support.'
    );
  }

  let authorization = originalAuthorizationState.authorization;

  while (authorization.status === 'pending') {
    await sleep(200);
    authorization = await fetchAuthorization(
      client,
      originalAuthorizationState.authorization.id
    );
  }

  output.stopSpinner();

  if (authorization.status === 'succeeded') {
    output.log('Validation complete.');
    return authorization.id;
  }

  if (authorization.status === 'failed') {
    throw new Error(
      'Payment validation failed. Please change your payment method via the web UI and try again.'
    );
  }

  output.spinner(
    'Payment validation requires manual action. Please complete the steps in your browser...'
  );

  handleManualVerificationAction(
    teamId,
    originalAuthorizationState.authorization.id
  );

  while (authorization.status !== 'succeeded') {
    await sleep(200);
    authorization = await fetchAuthorization(
      client,
      originalAuthorizationState.authorization.id
    );
    if (authorization.status === 'failed') {
      throw new Error(
        'Payment validation failed. Please change your payment method via the web UI and try again.'
      );
    }
  }

  output.stopSpinner();

  output.log('Validation complete.');
  return authorization.id;
}

function handleManualVerificationAction(
  teamId: string,
  authorizationId: string
) {
  const url = new URL('/api/marketplace/cli', 'https://vercel.com');
  url.searchParams.set('teamId', teamId);
  url.searchParams.set('authorizationId', authorizationId);
  url.searchParams.set('source', 'cli');
  url.searchParams.set('cmd', 'authorize');
  output.print('Opening the Vercel Dashboard to continue the installation...');
  output.debug(`Opening URL: ${url.href}`);
  open(url.href).catch((err: unknown) =>
    output.debug(`Failed to open browser: ${err}`)
  );
}

async function provisionStorageProduct(
  client: Client,
  product: IntegrationProduct,
  installation: IntegrationInstallation,
  name: string,
  metadata: Metadata,
  billingPlan: BillingPlan,
  authorizationId: string,
  contextName: string,
  options: AddOptions = {}
) {
  output.spinner('Provisioning resource...');
  let storeId: string;
  try {
    const result = await provisionStoreResource(
      client,
      installation.id,
      product.id,
      billingPlan.id,
      name,
      metadata,
      authorizationId
    );
    storeId = result.store.id;
  } catch (error) {
    output.error(
      `Failed to provision ${product.name}: ${(error as Error).message}`
    );
    return 1;
  } finally {
    output.stopSpinner();
  }
  output.success(
    `${product.name} successfully provisioned: ${chalk.bold(name)}`
  );

  return postProvisionSetup(client, name, storeId, contextName, options);
}
