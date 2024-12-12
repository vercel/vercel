import chalk from 'chalk';
import open from 'open';
import type Client from '../../util/client';
import formatTable from '../../util/format-table';
import { packageName } from '../../util/pkg-name';
import getScope from '../../util/get-scope';
import list from '../../util/input/list';
import cmd from '../../util/output/cmd';
import indent from '../../util/output/indent';
import { getLinkedProject } from '../../util/projects/link';
import type {
  BillingPlan,
  Integration,
  IntegrationInstallation,
  IntegrationProduct,
  Metadata,
} from '../../util/integration/types';
import { createMetadataWizard, type MetadataWizard } from './wizard';
import { provisionStoreResource } from '../../util/integration/provision-store-resource';
import { connectResourceToProject } from '../../util/integration-resource/connect-resource-to-project';
import { fetchBillingPlans } from '../../util/integration/fetch-billing-plans';
import { fetchInstallations } from '../../util/integration/fetch-installations';
import { fetchIntegration } from '../../util/integration/fetch-integration';
import output from '../../output-manager';
import { IntegrationAddTelemetryClient } from '../../util/telemetry/commands/integration/add';

export async function add(client: Client, args: string[]) {
  const telemetry = new IntegrationAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (args.length > 1) {
    output.error('Cannot install more than one integration at a time');
    return 1;
  }

  const integrationSlug = args[0];

  if (!integrationSlug) {
    output.error('You must pass an integration slug');
    return 1;
  }

  const { contextName, team } = await getScope(client);

  if (!team) {
    output.error('Team not found');
    return 1;
  }

  let integration: Integration | undefined;
  let knownIntegrationSlug = false;
  try {
    integration = await fetchIntegration(client, integrationSlug);
    knownIntegrationSlug = true;
  } catch (error) {
    output.error(
      `Failed to get integration "${integrationSlug}": ${(error as Error).message}`
    );
    return 1;
  } finally {
    telemetry.trackCliArgumentName(integrationSlug, knownIntegrationSlug);
  }

  if (!integration.products) {
    output.error(
      `Integration "${integrationSlug}" is not a Marketplace integration`
    );
    return 1;
  }

  const [productResult, installationsResult] = await Promise.allSettled([
    selectProduct(client, integration),
    fetchInstallations(client, integration),
  ]);

  if (productResult.status === 'rejected' || !productResult.value) {
    output.error('Product not found');
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

  // At the time of writing, we don't support native integrations besides storage products.
  // However, when we introduce new categories, we avoid breaking this version of the CLI by linking all
  // non-storage categories to the dashboard.
  // product.type is the old way of defining categories, while the protocols are the new way.
  const isPreProtocolStorageProduct = product.type === 'storage';
  const isPostProtocolStorageProduct =
    product.protocols?.storage?.status === 'enabled';
  const isStorageProduct =
    isPreProtocolStorageProduct || isPostProtocolStorageProduct;

  // The provisioning via cli is possible when
  // 1. The integration was installed once (terms have been accepted)
  // 2. The provider-defined metadata is supported (does not use metadata expressions etc.)
  // 3. The product type is supported
  const provisionResourceViaCLIIsSupported =
    installation && metadataWizard.isSupported && isStorageProduct;

  if (!provisionResourceViaCLIIsSupported) {
    const projectLink = await getOptionalLinkedProject(client);

    if (projectLink?.status === 'error') {
      return projectLink.exitCode;
    }

    const openInWeb = await client.input.confirm({
      message: !installation
        ? 'Terms have not been accepted. Open Vercel Dashboard?'
        : 'This resource must be provisioned through the Web UI. Open Vercel Dashboard?',
    });

    if (openInWeb) {
      privisionResourceViaWebUI(
        team.id,
        integration.id,
        product.id,
        projectLink?.project?.id
      );
    }

    return 0;
  }

  return provisionResourceViaCLI(
    client,
    integration,
    installation,
    product,
    metadataWizard
  );
}

async function getOptionalLinkedProject(client: Client) {
  const linkedProject = await getLinkedProject(client);

  if (linkedProject.status === 'not_linked') {
    return;
  }

  const shouldLinkToProject = await client.input.confirm({
    message: 'Do you want to link this resource to the current project?',
  });

  if (!shouldLinkToProject) {
    return;
  }

  if (linkedProject.status === 'error') {
    return { status: 'error', exitCode: linkedProject.exitCode };
  }

  return { status: 'success', project: linkedProject.project };
}

function privisionResourceViaWebUI(
  teamId: string,
  integrationId: string,
  productId: string,
  projectId?: string
) {
  const url = new URL('/api/marketplace/cli', 'https://vercel.com');
  url.searchParams.set('teamId', teamId);
  url.searchParams.set('integrationId', integrationId);
  url.searchParams.set('productId', productId);
  if (projectId) {
    url.searchParams.set('projectId', projectId);
  }
  url.searchParams.set('cmd', 'add');
  output.print('Opening the Vercel Dashboard to continue the installation...');
  open(url.href);
}

async function provisionResourceViaCLI(
  client: Client,
  integration: Integration,
  installation: IntegrationInstallation,
  product: IntegrationProduct,
  metadataWizard: MetadataWizard
) {
  const name = await client.input.text({
    message: 'What is the name of the resource?',
  });

  const metadata = await metadataWizard.run(client);

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

  const billingPlan = await selectBillingPlan(client, enabledBillingPlans);

  if (!billingPlan) {
    output.error('No billing plan selected');
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

  return provisionStorageProduct(
    client,
    product,
    installation,
    name,
    metadata,
    billingPlan
  );
}

async function selectProduct(client: Client, integration: Integration) {
  const products = integration.products;

  if (!products?.length) {
    return;
  }

  if (products.length === 1) {
    return products[0];
  }

  const selected = await client.input.select({
    message: 'Select a product',
    choices: products.map(product => ({
      description: product.shortDescription,
      name: product.name,
      value: product,
    })),
  });

  return selected;
}

async function selectBillingPlan(client: Client, billingPlans: BillingPlan[]) {
  const billingPlanId = await list(client, {
    message: 'Choose a billing plan',
    separator: true,
    choices: billingPlans.map(plan => {
      const body = [plan.description];

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

  return client.input.confirm({
    message: 'Confirm selection?',
  });
}

async function provisionStorageProduct(
  client: Client,
  product: IntegrationProduct,
  installation: IntegrationInstallation,
  name: string,
  metadata: Metadata,
  billingPlan: BillingPlan
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
      metadata
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
  output.log(`${product.name} successfully provisioned`);

  const projectLink = await getOptionalLinkedProject(client);

  if (projectLink?.status === 'error') {
    return projectLink.exitCode;
  }

  if (!projectLink?.project) {
    return 0;
  }

  const project = projectLink.project;

  const environments = await client.input.checkbox({
    message: 'Select environments',
    choices: [
      { name: 'Production', value: 'production', checked: true },
      { name: 'Preview', value: 'preview', checked: true },
      { name: 'Development', value: 'development', checked: true },
    ],
  });

  output.spinner(
    `Connecting ${chalk.bold(name)} to ${chalk.bold(project.name)}...`
  );
  try {
    await connectResourceToProject(
      client,
      projectLink.project.id,
      storeId,
      environments
    );
  } catch (error) {
    output.error(
      `Failed to connect store to project: ${(error as Error).message}`
    );
    return 1;
  } finally {
    output.stopSpinner();
  }
  output.log(
    `${chalk.bold(name)} successfully connected to ${chalk.bold(project.name)}

${indent(`Run ${cmd(`${packageName} env pull`)} to update the environment variables`, 4)}`
  );

  return 0;
}
