import chalk from 'chalk';
import open from 'open';
import output from '../../output-manager';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { autoProvisionResource } from '../../util/integration/auto-provision-resource';
import { fetchIntegration } from '../../util/integration/fetch-integration';
import type {
  AcceptedPolicies,
  AutoProvisionResult,
  IntegrationProduct,
} from '../../util/integration/types';
import { connectResourceToProject } from '../../util/integration-resource/connect-resource-to-project';
import cmd from '../../util/output/cmd';
import indent from '../../util/output/indent';
import { packageName } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';
import { IntegrationAddTelemetryClient } from '../../util/telemetry/commands/integration/add';
import { createMetadataWizard } from './wizard';

export async function addAutoProvision(
  client: Client,
  integrationSlug: string
) {
  const telemetry = new IntegrationAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  // 1. Get team context
  const { contextName, team } = await getScope(client);
  if (!team) {
    output.error('Team not found');
    return 1;
  }

  // 2. Fetch integration
  let integration;
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

  if (!integration.products?.length) {
    output.error(
      `Integration "${integrationSlug}" is not a Marketplace integration`
    );
    return 1;
  }

  // 3. Select product (or use only one if single product)
  let product: IntegrationProduct;
  if (integration.products.length === 1) {
    product = integration.products[0];
  } else {
    product = await client.input.select({
      message: 'Select a product',
      choices: integration.products.map(p => ({
        name: p.name,
        value: p,
        description: p.shortDescription,
      })),
    });
  }

  output.log(
    `Installing ${chalk.bold(product.name)} by ${chalk.bold(integration.name)} under ${chalk.bold(contextName)}`
  );
  output.debug(`Selected product: ${product.slug} (id: ${product.id})`);
  output.debug(
    `Product metadataSchema: ${JSON.stringify(product.metadataSchema, null, 2)}`
  );

  const metadataWizard = createMetadataWizard(product.metadataSchema);
  output.debug(`Metadata wizard supported: ${metadataWizard.isSupported}`);

  // 4. Get resource name
  const resourceName = await client.input.text({
    message: 'What is the name of the resource?',
    validate: value => (value.trim() ? true : 'Resource name is required'),
  });

  // 5. Collect metadata (if supported, otherwise let server use defaults)
  const metadata = metadataWizard.isSupported
    ? await metadataWizard.run(client)
    : {};
  output.debug(`Collected metadata: ${JSON.stringify(metadata)}`);
  output.debug(`Resource name: ${resourceName}`);

  // 6. First attempt with empty policies - discover what's required
  output.spinner('Provisioning resource...');
  let result: AutoProvisionResult;
  try {
    result = await autoProvisionResource(
      client,
      integration.slug,
      product.slug,
      resourceName,
      metadata,
      {} // Start with empty policies
    );
  } catch (error) {
    output.stopSpinner();
    output.error((error as Error).message);
    return 1;
  }
  output.stopSpinner();
  output.debug(`Auto-provision result: ${JSON.stringify(result, null, 2)}`);

  // 7. If policies required, prompt and retry
  if (result.kind === 'install') {
    output.debug(`Policy acceptance required`);
    const policies = result.integration.policies ?? {};
    output.debug(`Policies to accept: ${JSON.stringify(policies)}`);
    const acceptedPolicies: AcceptedPolicies = {};

    if (policies.privacy) {
      const accepted = await client.input.confirm(
        `Accept privacy policy? (${policies.privacy})`,
        false
      );
      if (!accepted) {
        output.error('Privacy policy must be accepted to continue.');
        return 1;
      }
      acceptedPolicies.privacy = new Date().toISOString();
    }

    if (policies.eula) {
      const accepted = await client.input.confirm(
        `Accept terms of service? (${policies.eula})`,
        false
      );
      if (!accepted) {
        output.error('Terms of service must be accepted to continue.');
        return 1;
      }
      acceptedPolicies.eula = new Date().toISOString();
    }

    // Retry with accepted policies
    output.debug(`Accepted policies: ${JSON.stringify(acceptedPolicies)}`);
    output.spinner('Provisioning resource...');
    try {
      result = await autoProvisionResource(
        client,
        integration.slug,
        product.slug,
        resourceName,
        metadata,
        acceptedPolicies
      );
    } catch (error) {
      output.stopSpinner();
      output.error((error as Error).message);
      return 1;
    }
    output.stopSpinner();
    output.debug(
      `Auto-provision retry result: ${JSON.stringify(result, null, 2)}`
    );
  }

  // 8. Handle non-provisioned responses (metadata, unknown)
  if (result.kind !== 'provisioned') {
    output.debug(`Fallback required - kind: ${result.kind}`);
    output.debug(`Fallback URL from API: ${result.url}`);

    // Offer project linking before opening browser
    const projectLink = await getOptionalLinkedProject(client);
    if (projectLink?.status === 'error') {
      return projectLink.exitCode;
    }

    output.log('Additional setup required. Opening browser...');
    const url = new URL(result.url);
    url.searchParams.set('defaultResourceName', resourceName);
    url.searchParams.set('source', 'cli');
    const definedMetadata = Object.fromEntries(
      Object.entries(metadata).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(definedMetadata).length > 0) {
      url.searchParams.set('metadata', JSON.stringify(definedMetadata));
    }
    if (projectLink?.project) {
      url.searchParams.set('projectSlug', projectLink.project.name);
    }
    output.debug(`Opening URL: ${url.href}`);
    open(url.href);
    return 0;
  }

  // 9. Success!
  output.debug(
    `Provisioned resource: ${JSON.stringify(result.resource, null, 2)}`
  );
  output.debug(`Installation: ${JSON.stringify(result.installation, null, 2)}`);
  output.debug(`Billing plan: ${JSON.stringify(result.billingPlan, null, 2)}`);
  output.success(`${product.name} successfully provisioned`);

  // 10. Link to project (prompt)
  const projectLink = await getOptionalLinkedProject(client);
  if (projectLink?.status === 'error') {
    return projectLink.exitCode;
  }

  if (!projectLink?.project) {
    return 0;
  }

  // 11. Select environments and connect
  const environments = await client.input.checkbox({
    message: 'Select environments',
    choices: [
      { name: 'Production', value: 'production', checked: true },
      { name: 'Preview', value: 'preview', checked: true },
      { name: 'Development', value: 'development', checked: true },
    ],
  });
  output.debug(`Selected environments: ${JSON.stringify(environments)}`);

  output.spinner(`Connecting to ${chalk.bold(projectLink.project.name)}...`);
  output.debug(
    `Connecting resource ${result.resource.id} to project ${projectLink.project.id}`
  );
  try {
    await connectResourceToProject(
      client,
      projectLink.project.id,
      result.resource.id,
      environments
    );
  } catch (error) {
    output.stopSpinner();
    output.error(`Failed to connect: ${(error as Error).message}`);
    return 1;
  }
  output.stopSpinner();

  output.success(`Connected to ${projectLink.project.name}`);
  output.log(
    indent(
      `Run ${cmd(`${packageName} env pull`)} to update environment variables`,
      4
    )
  );

  return 0;
}

async function getOptionalLinkedProject(client: Client) {
  const linkedProject = await getLinkedProject(client);

  if (linkedProject.status === 'not_linked') {
    return;
  }

  const shouldLinkToProject = await client.input.confirm(
    'Do you want to link this resource to the current project?',
    true
  );

  if (!shouldLinkToProject) {
    return;
  }

  if (linkedProject.status === 'error') {
    return { status: 'error' as const, exitCode: linkedProject.exitCode };
  }

  return { status: 'success' as const, project: linkedProject.project };
}
