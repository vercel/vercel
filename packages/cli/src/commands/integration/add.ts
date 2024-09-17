import chalk from 'chalk';
import open from 'open';
import Client from '../../util/client';
import formatTable from '../../util/format-table';
import { packageName } from '../../util/pkg-name';
import getScope from '../../util/get-scope';
import list from '../../util/input/list';
import cmd from '../../util/output/cmd';
import indent from '../../util/output/indent';
import { getLinkedProject } from '../../util/projects/link';
import {
  BillingPlan,
  Integration,
  IntegrationProduct,
  Metadata,
} from './types';
import { createMetadataWizard } from './wizard';

export async function add(client: Client, args: string[]) {
  if (args.length > 1) {
    client.output.error(`Can't install more than one integration at a time.`);
    return 1;
  }

  const { contextName, team } = await getScope(client);

  if (!team) {
    client.output.error('Team not found');
    return 1;
  }

  const integrationSlug = args[0];
  const integration = await fetchIntegration(client, integrationSlug);

  if (!integration?.products) {
    return 1;
  }

  const [product, installations] = await Promise.all([
    selectProduct(client, integration),
    fetchInstallations(client, integration),
  ]);

  if (!product || !installations) {
    return 1;
  }

  const installation = installations.find(
    install =>
      install.ownerId === team.id && install.installationType === 'marketplace'
  );

  client.output.log(
    `Installing ${chalk.bold(product.name)} by ${chalk.bold(integration.name)} under ${chalk.bold(contextName)}`
  );

  const metadataSchema = product.metadataSchema;
  const metadataWizard = createMetadataWizard(metadataSchema);

  if (
    !installation ||
    !metadataWizard.isSupported ||
    product.type !== 'storage'
  ) {
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
        client,
        team.id,
        integration.id,
        product.id,
        projectLink?.project?.id
      );
    }

    return 0;
  }

  const name = await client.input.text({
    message: 'What is the name of the resource?',
  });

  const metadata = await metadataWizard.run(client);

  const billingPlans = await fetchBillingPlans(
    client,
    integration,
    product,
    metadata
  );

  if (!billingPlans) {
    return 1;
  }

  const enabledBillingPlans = billingPlans.plans.filter(plan => !plan.disabled);

  if (!enabledBillingPlans.length) {
    client.output.log('No billing plans available.');
    return 1;
  }

  const billingPlan = await selectBillingPlan(client, enabledBillingPlans);

  client.output.print('Selected product:\n');
  client.output.print(`${chalk.dim(`- ${chalk.bold(`Name:`)} ${name}`)}\n`);
  for (const [key, value] of Object.entries(metadata)) {
    client.output.print(
      `${chalk.dim(`- ${chalk.bold(`${metadataSchema.properties[key]['ui:label']}:`)} ${value}`)}\n`
    );
  }
  client.output.print(
    `${chalk.dim(`- ${chalk.bold(`Plan:`)} ${billingPlans.plans.find(plan => plan.id === billingPlan)?.name}`)}\n`
  );

  const confirmed = await client.input.confirm({
    message: 'Confirm selection?',
  });

  if (!confirmed) {
    return 1;
  }

  client.output.spinner('Provisioning resource...');
  let storeId: string;
  try {
    const result = await provisionResource(
      client,
      installation.id,
      product.id,
      billingPlan,
      name,
      metadata
    );
    storeId = result.store.id;
  } catch (error) {
    client.output.error((error as Error).message);
    return 1;
  }
  client.output.log(`${product.name} successfully provisioned`);

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

  client.output.spinner(
    `Connecting ${chalk.bold(name)} to ${chalk.bold(project.name)}...`
  );
  try {
    await connectStoreToProject(
      client,
      projectLink.project.id,
      storeId,
      environments
    );
  } catch (error) {
    client.output.error((error as Error).message);
    return 1;
  }
  client.output.log(
    `${chalk.bold(name)} successfully connected to ${chalk.bold(project.name)}

${indent(`Run ${cmd(`${packageName} env pull`)} to update the environment variables`, 4)}`
  );

  return 0;
}

async function provisionResource(
  client: Client,
  installationId: string,
  productId: string,
  billingPlanId: string,
  name: string,
  metadata: Metadata
) {
  return await client.fetch<{ store: { id: string } }>(
    '/v1/storage/stores/integration',
    {
      method: 'POST',
      json: true,
      body: {
        billingPlanId,
        integrationConfigurationId: installationId,
        integrationProductIdOrSlug: productId,
        metadata,
        name,
      },
    }
  );
}

async function connectStoreToProject(
  client: Client,
  projectId: string,
  storeId: string,
  environments: string[]
) {
  return client.fetch(`/v1/storage/stores/${storeId}/connections`, {
    json: true,
    method: 'POST',
    body: {
      envVarEnvironments: environments,
      projectId,
      type: 'integration',
    },
  });
}

async function fetchInstallations(client: Client, integration: Integration) {
  try {
    return await client.fetch<
      {
        id: string;
        installationType: 'marketplace' | 'external';
        ownerId: string;
      }[]
    >(
      `/v1/integrations/integration/${integration.id}/installed?source=marketplace`,
      {
        json: true,
      }
    );
  } catch (error) {
    client.output.error((error as Error).message);
  }
}

async function fetchBillingPlans(
  client: Client,
  integration: Integration,
  product: IntegrationProduct,
  metadata: Metadata
) {
  const searchParams = new URLSearchParams();
  searchParams.set('metadata', JSON.stringify(metadata));

  try {
    return await client.fetch<{ plans: BillingPlan[] }>(
      `/v1/integrations/integration/${integration.id}/products/${product.id}/plans?${searchParams}`,
      {
        json: true,
      }
    );
  } catch (error) {
    client.output.error((error as Error).message);
  }
}

async function fetchIntegration(client: Client, slug: string) {
  try {
    return await client.fetch<Integration>(
      `/v1/integrations/integration/${slug}?public=1`,
      {
        json: true,
      }
    );
  } catch (error) {
    client.output.error((error as Error).message);
  }
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
  return list(client, {
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
  client: Client,
  teamId: string,
  integrationId: string,
  productId: string,
  projectId?: string
) {
  const url = new URL(`/api/marketplace/cli`, 'https://vercel.com');
  url.searchParams.set('teamId', teamId);
  url.searchParams.set('integrationId', integrationId);
  url.searchParams.set('productId', productId);
  if (projectId) {
    url.searchParams.set('projectId', projectId);
  }
  url.searchParams.set('cmd', 'add');
  client.output.print(
    `Opening the Vercel Dashboard to continue the installation...`
  );
  open(url.href);
}
