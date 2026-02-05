import chalk from 'chalk';
import open from 'open';
import output from '../../output-manager';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { autoProvisionResource } from '../../util/integration/auto-provision-resource';
import { fetchIntegration } from '../../util/integration/fetch-integration';
import { selectProduct } from '../../util/integration/select-product';
import type {
  AcceptedPolicies,
  AutoProvisionResult,
} from '../../util/integration/types';
import { resolveResourceName } from '../../util/integration/generate-resource-name';
import {
  getLinkedProjectField,
  postProvisionSetup,
  type PostProvisionOptions,
} from '../../util/integration/post-provision-setup';
import { IntegrationAddTelemetryClient } from '../../util/telemetry/commands/integration/add';
import { parseMetadataFlags } from '../../util/integration/parse-metadata';
import type { Metadata } from '../../util/integration/types';

export interface AddAutoProvisionOptions extends PostProvisionOptions {
  metadata?: string[];
  productSlug?: string;
}

export async function addAutoProvision(
  client: Client,
  integrationSlug: string,
  resourceNameArg?: string,
  options: AddAutoProvisionOptions = {}
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

  telemetry.trackCliOptionName(resourceNameArg);
  telemetry.trackCliFlagNoConnect(options.noConnect);
  telemetry.trackCliFlagNoEnvPull(options.noEnvPull);

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
    telemetry.trackCliArgumentIntegration(
      integrationSlug,
      knownIntegrationSlug
    );
  }

  if (!integration.products?.length) {
    output.error(
      `Integration "${integrationSlug}" is not a Marketplace integration`
    );
    return 1;
  }

  // 3. Select product (by slug, single auto-select, or interactive prompt)
  const product = await selectProduct(
    client,
    integration.products,
    options.productSlug
  );
  if (!product) {
    return 1;
  }

  output.log(
    `Installing ${chalk.bold(product.name)} by ${chalk.bold(integration.name)} under ${chalk.bold(contextName)}`
  );
  output.debug(`Selected product: ${product.slug} (id: ${product.id})`);
  output.debug(
    `Product metadataSchema: ${JSON.stringify(product.metadataSchema, null, 2)}`
  );

  // 4. Validate metadata flags (if provided) BEFORE prompting for resource name
  //    In NEW path, server fills defaults - we never run the wizard here
  let metadata: Metadata;
  if (options.metadata?.length) {
    // Parse metadata from CLI flags
    output.debug(
      `Parsing metadata from flags: ${JSON.stringify(options.metadata)}`
    );
    const { metadata: parsed, errors } = parseMetadataFlags(
      options.metadata,
      product.metadataSchema
    );
    if (errors.length) {
      for (const error of errors) {
        output.error(error);
      }
      return 1;
    }
    metadata = parsed;
  } else {
    // No --metadata flags: pass {} and let server fill defaults (API PR #58905)
    metadata = {};
  }

  // 5. Resolve and validate resource name
  const nameResult = resolveResourceName(product.slug, resourceNameArg);
  if ('error' in nameResult) {
    output.error(nameResult.error);
    return 1;
  }
  const { resourceName } = nameResult;

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

    // Auto-detect project for browser URL
    const projectLink = await getLinkedProjectField(
      client,
      options.noConnect,
      'name'
    );
    if (projectLink.exitCode !== undefined) {
      return projectLink.exitCode;
    }

    output.log('Additional setup required. Opening browser...');
    const url = new URL(result.url);
    url.searchParams.set('defaultResourceName', resourceName);
    url.searchParams.set('source', 'cli');
    if (projectLink.value) {
      url.searchParams.set('projectSlug', projectLink.value);
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
  output.success(
    `${product.name} successfully provisioned: ${chalk.bold(resourceName)}`
  );

  // 10. Post-provision: dashboard URL, connect, env pull
  return postProvisionSetup(
    client,
    resourceName,
    result.resource.id,
    contextName,
    options
  );
}
