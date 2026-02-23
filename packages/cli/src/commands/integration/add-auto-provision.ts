import chalk from 'chalk';
import { errorToString } from '@vercel/error-utils';
import open from 'open';
import output from '../../output-manager';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { autoProvisionResource } from '../../util/integration/auto-provision-resource';
import { fetchIntegrationWithTelemetry } from '../../util/integration/fetch-integration';
import { fetchInstallations } from '../../util/integration/fetch-installations';
import { promptForTermAcceptance } from '../../util/integration/prompt-for-terms';
import { selectProduct } from '../../util/integration/select-product';
import type {
  AcceptedPolicies,
  AutoProvisionedResponse,
  AutoProvisionFallback,
  AutoProvisionResult,
} from '../../util/integration/types';
import { resolveResourceName } from '../../util/integration/generate-resource-name';
import {
  getLinkedProjectField,
  postProvisionSetup,
  type PostProvisionOptions,
} from '../../util/integration/post-provision-setup';
import { IntegrationAddTelemetryClient } from '../../util/telemetry/commands/integration/add';
import {
  parseMetadataFlags,
  validateAndPrintRequiredMetadata,
} from '../../util/integration/parse-metadata';
import type { Metadata } from '../../util/integration/types';

export interface AddAutoProvisionOptions extends PostProvisionOptions {
  metadata?: string[];
  productSlug?: string;
  billingPlanId?: string;
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
  telemetry.trackCliOptionName(resourceNameArg);
  telemetry.trackCliOptionMetadata(options.metadata);
  telemetry.trackCliFlagNoConnect(options.noConnect);
  telemetry.trackCliFlagNoEnvPull(options.noEnvPull);
  telemetry.trackCliOptionPlan(options.billingPlanId);
  telemetry.trackCliOptionEnvironment(options.environments);
  telemetry.trackCliOptionPrefix(options.prefix);

  // Get team context
  const { contextName, team } = await getScope(client);
  if (!team) {
    output.error('Team not found');
    return 1;
  }
  client.config.currentTeam = team.id;

  // Fetch integration
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

  // Select product (by slug, single auto-select, or interactive prompt in TTY)
  if (
    !options.productSlug &&
    integration.products.length > 1 &&
    !client.stdin.isTTY
  ) {
    const choices = integration.products
      .map(p => `  ${integrationSlug}/${p.slug}`)
      .join('\n');
    output.error(
      `Integration "${integrationSlug}" has multiple products. Specify one with:\n\n${choices}\n\nExample: vercel integration add ${integrationSlug}/${integration.products[0].slug}`
    );
    return 1;
  }

  // Select product and check installations in parallel
  const [productResult, installationsResult] = await Promise.allSettled([
    selectProduct(client, integration.products, options.productSlug),
    fetchInstallations(client, integration),
  ]);

  if (productResult.status === 'rejected') {
    output.error(
      `Failed to select product: ${(productResult.reason as Error).message}`
    );
    return 1;
  }

  if (!productResult.value) {
    return 1;
  }

  if (installationsResult.status === 'rejected') {
    output.error(
      `Failed to get integration installations: ${(installationsResult.reason as Error).message}`
    );
    return 1;
  }

  const product = productResult.value;
  const installations = installationsResult.value;

  const baseProps = {
    integration_id: integration.id,
    integration_slug: integration.slug,
    integration_name: integration.name,
    product_id: product.id,
    product_slug: product.slug,
    team_id: team.id,
    source: 'cli',
    is_auto_provision: true,
  };

  telemetry.trackMarketplaceEvent(
    'marketplace_install_flow_started',
    baseProps
  );

  output.log(
    `Installing ${chalk.bold(product.name)} by ${chalk.bold(integration.name)} under ${chalk.bold(contextName)}`
  );
  output.debug(`Selected product: ${product.slug} (id: ${product.id})`);
  output.debug(
    `Product metadataSchema: ${JSON.stringify(product.metadataSchema, null, 2)}`
  );

  // 3b. Check if integration is installed on this team
  const teamInstallation = installations.find(
    i => i.ownerId === team.id && i.installationType === 'marketplace'
  );

  let acceptedPolicies: AcceptedPolicies = {};
  if (!teamInstallation) {
    const policies = await promptForTermAcceptance(client, integration);
    if (!policies) {
      telemetry.trackMarketplaceEvent('marketplace_install_flow_dropped', {
        ...baseProps,
        reason: 'policy_declined',
      });
      return 1;
    }
    acceptedPolicies = policies;
  }

  // Validate metadata flags (if provided) BEFORE prompting for resource name
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
      telemetry.trackMarketplaceEvent('marketplace_install_flow_dropped', {
        ...baseProps,
        reason: 'metadata_parse_error',
      });
      return 1;
    }
    if (!validateAndPrintRequiredMetadata(parsed, product.metadataSchema)) {
      telemetry.trackMarketplaceEvent('marketplace_install_flow_dropped', {
        ...baseProps,
        reason: 'metadata_validation_failed',
      });
      return 1;
    }
    metadata = parsed;
  } else {
    // No --metadata flags: pass {} and let server fill defaults (API PR #58905)
    metadata = {};
  }

  // Resolve and validate resource name
  const nameResult = resolveResourceName(product.slug, resourceNameArg);
  if ('error' in nameResult) {
    output.error(nameResult.error);
    telemetry.trackMarketplaceEvent('marketplace_install_flow_dropped', {
      ...baseProps,
      reason: 'resource_name_invalid',
    });
    return 1;
  }
  const { resourceName } = nameResult;

  output.debug(`Collected metadata: ${JSON.stringify(metadata)}`);
  output.debug(`Resource name: ${resourceName}`);

  // Track plan selection
  telemetry.trackMarketplaceEvent('marketplace_checkout_plan_selected', {
    ...baseProps,
    billing_plan_id: options.billingPlanId ?? null,
    plan_selection_method: options.billingPlanId
      ? 'cli_flag'
      : 'server_default',
  });

  // Provision resource
  telemetry.trackMarketplaceEvent(
    'marketplace_checkout_provisioning_started',
    baseProps
  );
  output.spinner('Provisioning resource...');
  let result: AutoProvisionResult;
  try {
    result = await autoProvisionResource(
      client,
      integration.slug,
      product.slug,
      resourceName,
      metadata,
      acceptedPolicies,
      options.billingPlanId
    );
  } catch (error) {
    output.stopSpinner();
    telemetry.trackMarketplaceEvent(
      'marketplace_checkout_provisioning_failed',
      {
        ...baseProps,
        error_message: errorToString(error),
      }
    );
    output.error(errorToString(error));
    return 1;
  }
  output.stopSpinner();
  output.debug(`Auto-provision result: ${JSON.stringify(result, null, 2)}`);

  // Handle non-provisioned responses — pass through kind/reason from server
  if (result.kind !== 'provisioned') {
    const fallback = result as AutoProvisionFallback;
    telemetry.trackMarketplaceEvent('marketplace_install_flow_web_fallback', {
      ...baseProps,
      reason: fallback.reason ?? fallback.kind,
      auto_provision_result_kind: fallback.kind,
      auto_provision_result_reason: fallback.reason,
      auto_provision_error_message: fallback.error_message,
    });
    output.debug(`Fallback required - kind: ${fallback.kind}`);
    output.debug(`Fallback URL from API: ${fallback.url}`);

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
    const url = new URL(fallback.url);
    url.searchParams.set('defaultResourceName', resourceName);
    url.searchParams.set('source', 'cli');
    if (Object.keys(metadata).length > 0) {
      url.searchParams.set('metadata', JSON.stringify(metadata));
    }
    if (projectLink.value) {
      url.searchParams.set('projectSlug', projectLink.value);
    }
    if (options.billingPlanId) {
      url.searchParams.set('planId', options.billingPlanId);
    }
    output.debug(`Opening URL: ${url.href}`);
    open(url.href).catch((err: unknown) =>
      output.debug(`Failed to open browser: ${err}`)
    );
    return 1;
  }

  // Success!
  const provisioned = result as AutoProvisionedResponse;
  telemetry.trackMarketplaceEvent(
    'marketplace_checkout_provisioning_completed',
    {
      ...baseProps,
      resource_id: provisioned.resource.id,
    }
  );
  output.debug(
    `Provisioned resource: ${JSON.stringify(provisioned.resource, null, 2)}`
  );
  output.debug(
    `Installation: ${JSON.stringify(provisioned.installation, null, 2)}`
  );
  output.debug(
    `Billing plan: ${JSON.stringify(provisioned.billingPlan, null, 2)}`
  );
  output.success(
    `${product.name} successfully provisioned: ${chalk.bold(resourceName)}`
  );

  // Post-provision: dashboard URL, connect, env pull
  return postProvisionSetup(
    client,
    resourceName,
    provisioned.resource.id,
    contextName,
    {
      ...options,
      onProjectConnected: (projectId: string) => {
        telemetry.trackMarketplaceEvent('marketplace_project_connected', {
          ...baseProps,
          project_id: projectId,
          resource_id: provisioned.resource.id,
        });
      },
      onProjectConnectFailed: (projectId: string, error: Error) => {
        telemetry.trackMarketplaceEvent('marketplace_project_connect_failed', {
          ...baseProps,
          project_id: projectId,
          resource_id: provisioned.resource.id,
          error_message: error.message,
        });
      },
    }
  );
}
