import { Team } from '@vercel-internals/types';
import open from 'open';
import Client from '../../util/client';
import getUser from '../../util/get-user';
import { getLinkedProject } from '../../util/projects/link';
import getTeamById from '../../util/teams/get-team-by-id';

export interface IntegrationProduct {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  type: 'storage' | string;
}

export interface Integration {
  id: string;
  slug: string;
  name: string;
  products?: IntegrationProduct[];
}

export async function add(client: Client, args: string[]) {
  if (args.length > 1) {
    client.output.error(`Can't install more than one integration at a time.`);
    return 1;
  }

  const integrationSlug = args[0];

  const user = await getUser(client);
  const teamId = client.config.currentTeam ?? user.defaultTeamId;

  if (!teamId) {
    client.output.error('Team not found');
    return 1;
  }

  const team = await getTeamById(client, teamId);
  const integration = await fetchIntegration(client, team, integrationSlug);

  if (!integration) {
    client.output.error(`Integration not found: ${integrationSlug}`);
    return 1;
  }

  if (!integration.products) {
    client.output.error(
      `Integration is not from the marketplace: ${integration.name}`
    );
    return 1;
  }

  const product = await selectProduct(client, integration);

  if (!product) {
    client.output.error(
      `No products found for integration: ${integration.name}`
    );
    return 1;
  }

  const projectLink = await getOptionalLinkedProject(client);

  if (projectLink?.status === 'error') {
    return projectLink.exitCode;
  }

  privisionResourceViaWebUI(
    client,
    teamId,
    integration.id,
    product.id,
    projectLink?.project?.id
  );

  return 0;
}

async function fetchIntegration(client: Client, team: Team, slug: string) {
  try {
    return await client.fetch<Integration>(
      `/v1/integrations/integration/${slug}?teamSlug=${team.slug}&source=marketplace&public=1`,
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
