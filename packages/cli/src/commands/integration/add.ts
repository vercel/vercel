import chalk from 'chalk';
import open from 'open';
import type Client from '../../util/client';
import { packageName } from '../../util/pkg-name';
import getScope from '../../util/get-scope';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import cmd from '../../util/output/cmd';
import indent from '../../util/output/indent';
import { getLinkedProject } from '../../util/projects/link';
import type { Integration, Metadata } from '../../util/integration/types';
import { createMetadataWizard } from './wizard';
import { connectResourceToProject } from '../../util/integration-resource/connect-resource-to-project';
import { fetchIntegration } from '../../util/integration/fetch-integration';
import {
  autoProvisionResource,
  type AutoProvisionResponse,
  type PlanSelectionStep,
  type PaymentRequiredStep,
} from '../../util/integration/auto-provision-resource';
import { createAuthorization } from '../../util/integration/create-authorization';
import { fetchAuthorization } from '../../util/integration/fetch-authorization';
import sleep from '../../util/sleep';
import output from '../../output-manager';
import { IntegrationAddTelemetryClient } from '../../util/telemetry/commands/integration/add';
import { addSubcommand } from './command';

export async function add(client: Client, args: string[]) {
  const telemetry = new IntegrationAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  // Parse flags
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  const { flags } = parseArguments(args, flagsSpecification);
  const acceptTerms = !!flags['--accept-terms'];
  telemetry.trackCliFlagAcceptTerms(acceptTerms);

  // Filter out flags from args to get positional arguments
  const positionalArgs = args.filter(arg => !arg.startsWith('-'));

  if (positionalArgs.length > 1) {
    output.error('Cannot install more than one integration at a time');
    return 1;
  }

  const integrationSlug = positionalArgs[0];

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

  const product = await selectProduct(client, integration);
  if (!product) {
    output.error('Product not found');
    return 1;
  }

  output.log(
    `Installing ${chalk.bold(product.name)} by ${chalk.bold(integration.name)} under ${chalk.bold(contextName)}`
  );

  // Get resource name
  const name = await client.input.text({
    message: 'What is the name of the resource?',
  });

  // Get metadata if needed
  const metadataSchema = product.metadataSchema;
  const metadataWizard = createMetadataWizard(metadataSchema);
  let metadata: Metadata = {};

  if (metadataWizard.isSupported) {
    metadata = await metadataWizard.run(client);
  }

  // Try auto-provision without policies first (in case installation already exists)
  output.spinner('Provisioning resource...', 500);
  let response: AutoProvisionResponse;
  try {
    response = await autoProvisionResource(client, {
      integrationIdOrSlug: integration.slug,
      productIdOrSlug: product.slug,
      name,
      metadata,
      source: 'cli',
    });
  } catch (error) {
    output.stopSpinner();
    output.error(`Failed to provision resource: ${(error as Error).message}`);
    return 1;
  }
  output.stopSpinner();

  // Handle 'install' response - need to accept policies
  if (response.kind === 'install') {
    const policies = response.integration.policies;
    const vercelTermsUrl =
      'https://vercel.com/legal/integration-marketplace-end-users-addendum';

    output.log('');
    output.log(chalk.bold('Terms & Conditions'));
    output.log('By continuing, you agree to the following:');
    output.log('');
    output.log(`  • Vercel Integration Marketplace End User Addendum`);
    output.log(`    ${chalk.cyan(vercelTermsUrl)}`);
    if (policies.eula) {
      output.log(`  • ${response.integration.name} EULA`);
      output.log(`    ${chalk.cyan(policies.eula)}`);
    }
    if (policies.privacy) {
      output.log(`  • ${response.integration.name} Privacy Policy`);
      output.log(`    ${chalk.cyan(policies.privacy)}`);
    }
    output.log('');

    let shouldAccept = acceptTerms;
    if (!acceptTerms) {
      shouldAccept = await client.input.confirm('Accept all terms?', false);
    }

    if (!shouldAccept) {
      output.log('Terms not accepted. Installation cancelled.');
      return 1;
    }

    // Build acceptedPolicies with current timestamp
    const now = new Date().toISOString();
    const acceptedPolicies: Record<string, string> = {};
    if (policies.eula) {
      acceptedPolicies.eula = now;
    }
    if (policies.privacy) {
      acceptedPolicies.privacy = now;
    }

    // Retry with accepted policies
    output.spinner('Accepting terms and provisioning resource...', 500);
    try {
      response = await autoProvisionResource(client, {
        integrationIdOrSlug: integration.slug,
        productIdOrSlug: product.slug,
        name,
        metadata,
        acceptedPolicies,
        source: 'cli',
      });
    } catch (error) {
      output.stopSpinner();
      output.error(`Failed to provision resource: ${(error as Error).message}`);
      return 1;
    }
    output.stopSpinner();
  }

  // Handle 'metadata' response - should not happen since we collected metadata
  if (response.kind === 'metadata') {
    return openWebUI(
      response.url,
      'This resource requires additional configuration. Opening Vercel Dashboard...'
    );
  }

  // Handle 'plan_selection' response - let user pick a plan
  if (response.kind === 'plan_selection') {
    const selectedPlan = await selectBillingPlan(client, response);
    if (!selectedPlan) {
      output.log('No plan selected. Installation cancelled.');
      return 1;
    }

    // Retry with selected plan
    return await provisionWithPlan(client, {
      integrationIdOrSlug: integration.slug,
      productIdOrSlug: product.slug,
      name,
      metadata,
      source: 'cli',
      billingPlanId: selectedPlan.id,
      installationId: response.installation.id,
    });
  }

  // Handle 'payment_required' response - create authorization and retry
  if (response.kind === 'payment_required') {
    return await handlePaymentRequired(client, response, {
      integrationIdOrSlug: integration.slug,
      productIdOrSlug: product.slug,
      name,
      metadata,
      source: 'cli',
      billingPlanId: response.billingPlan.id,
      installationId: response.installation.id,
    });
  }

  // Handle 'requires_action' response - 3DS verification needed
  if (response.kind === 'requires_action') {
    output.log(
      'Payment verification required. Please complete verification in your browser.'
    );
    // TODO: Open Stripe 3DS verification page
    output.error('3DS verification via CLI is not yet supported.');
    return 1;
  }

  // Handle 'unknown' response - need to use web UI
  if (response.kind === 'unknown') {
    return openWebUI(
      response.url,
      'This resource requires the Vercel Dashboard to complete provisioning. Opening browser...'
    );
  }

  // Handle 'provisioned' response - success!
  if (response.kind === 'provisioned') {
    output.log(
      `${chalk.bold(response.resource.name)} successfully provisioned`
    );

    if (response.billingPlan) {
      output.log(`  Plan: ${response.billingPlan.name}`);
    }

    // Optionally connect to project
    return await maybeConnectToProject(client, response.resource.id, name);
  }

  // Should not reach here
  output.error('Unexpected response from server');
  return 1;
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

function openWebUI(url: string, message: string): number {
  output.log(message);
  output.log(`  ${chalk.cyan(url)}`);
  open(url);
  return 0;
}

async function maybeConnectToProject(
  client: Client,
  resourceId: string,
  resourceName: string
): Promise<number> {
  const linkedProject = await getLinkedProject(client);

  if (linkedProject.status === 'not_linked') {
    return 0;
  }

  if (linkedProject.status === 'error') {
    return linkedProject.exitCode;
  }

  const shouldLink = await client.input.confirm(
    'Do you want to link this resource to the current project?',
    true
  );

  if (!shouldLink) {
    return 0;
  }

  const project = linkedProject.project;

  const environments = await client.input.checkbox({
    message: 'Select environments',
    choices: [
      { name: 'Production', value: 'production', checked: true },
      { name: 'Preview', value: 'preview', checked: true },
      { name: 'Development', value: 'development', checked: true },
    ],
  });

  output.spinner(
    `Connecting ${chalk.bold(resourceName)} to ${chalk.bold(project.name)}...`
  );
  try {
    await connectResourceToProject(
      client,
      project.id,
      resourceId,
      environments
    );
  } catch (error) {
    output.stopSpinner();
    output.error(
      `Failed to connect resource to project: ${(error as Error).message}`
    );
    return 1;
  }
  output.stopSpinner();

  output.log(
    `${chalk.bold(resourceName)} successfully connected to ${chalk.bold(project.name)}

${indent(`Run ${cmd(`${packageName} env pull`)} to update the environment variables`, 4)}`
  );

  return 0;
}

async function selectBillingPlan(client: Client, response: PlanSelectionStep) {
  const enabledPlans = response.plans.filter(plan => !plan.disabled);

  if (!enabledPlans.length) {
    output.error('No billing plans available for this product.');
    return undefined;
  }

  if (enabledPlans.length === 1) {
    const plan = enabledPlans[0];
    const confirmed = await client.input.confirm(
      `This product requires the "${plan.name}" plan${plan.cost ? ` (${plan.cost})` : ''}. Continue?`,
      true
    );
    return confirmed ? plan : undefined;
  }

  const selected = await client.input.select({
    message: 'Select a billing plan',
    choices: enabledPlans.map(plan => ({
      name: `${plan.name}${plan.cost ? ` - ${plan.cost}` : ''}`,
      description: plan.description,
      value: plan,
    })),
  });

  return selected;
}

interface ProvisionWithPlanOptions {
  integrationIdOrSlug: string;
  productIdOrSlug: string;
  name: string;
  metadata: Metadata;
  source: string;
  billingPlanId: string;
  installationId: string;
}

async function provisionWithPlan(
  client: Client,
  options: ProvisionWithPlanOptions
): Promise<number> {
  output.spinner('Provisioning resource...', 500);
  let response: AutoProvisionResponse;
  try {
    response = await autoProvisionResource(client, {
      integrationIdOrSlug: options.integrationIdOrSlug,
      productIdOrSlug: options.productIdOrSlug,
      name: options.name,
      metadata: options.metadata,
      source: options.source,
      billingPlanId: options.billingPlanId,
    });
  } catch (error) {
    output.stopSpinner();
    output.error(`Failed to provision resource: ${(error as Error).message}`);
    return 1;
  }
  output.stopSpinner();

  // Handle payment_required - create authorization
  if (response.kind === 'payment_required') {
    return await handlePaymentRequired(client, response, options);
  }

  // Handle requires_action - 3DS needed
  if (response.kind === 'requires_action') {
    output.error('3DS verification via CLI is not yet supported.');
    return 1;
  }

  // Handle provisioned - success
  if (response.kind === 'provisioned') {
    output.log(
      `${chalk.bold(response.resource.name)} successfully provisioned`
    );
    if (response.billingPlan) {
      output.log(`  Plan: ${response.billingPlan.name}`);
    }
    return await maybeConnectToProject(
      client,
      response.resource.id,
      response.resource.name
    );
  }

  output.error('Unexpected response from server');
  return 1;
}

async function handlePaymentRequired(
  client: Client,
  response: PaymentRequiredStep,
  options: ProvisionWithPlanOptions
): Promise<number> {
  const plan = response.billingPlan;

  output.log('');
  output.log(chalk.bold('Payment Authorization Required'));
  output.log(`Plan: ${plan.name}${plan.cost ? ` (${plan.cost})` : ''}`);

  if (plan.preauthorizationAmount && plan.preauthorizationAmount > 0) {
    output.log(
      `A pre-authorization of $${(plan.preauthorizationAmount / 100).toFixed(2)} will be placed on your payment method.`
    );
  }
  output.log('');

  const confirmed = await client.input.confirm(
    'Authorize payment and continue?',
    true
  );

  if (!confirmed) {
    output.log('Payment not authorized. Installation cancelled.');
    return 1;
  }

  // Create authorization
  output.spinner('Creating payment authorization...', 500);
  let authorizationId: string;
  try {
    const authResult = await createAuthorization(
      client,
      options.integrationIdOrSlug,
      options.installationId,
      options.productIdOrSlug,
      options.billingPlanId,
      options.metadata,
      plan.preauthorizationAmount
    );

    if (!authResult.authorization) {
      output.stopSpinner();
      output.error('Failed to create payment authorization.');
      return 1;
    }

    authorizationId = authResult.authorization.id;

    // Wait for authorization to be ready
    let authorization = authResult.authorization;
    while (authorization.status === 'pending') {
      await sleep(1000);
      authorization = await fetchAuthorization(client, authorizationId);
    }

    if (authorization.status === 'requires_action') {
      output.stopSpinner();
      output.error(
        '3DS verification required. Please complete the purchase in the Vercel Dashboard.'
      );
      return 1;
    }

    if (authorization.status !== 'succeeded') {
      output.stopSpinner();
      output.error(
        `Payment authorization failed: ${authorization.reason || 'Unknown error'}`
      );
      return 1;
    }
  } catch (error) {
    output.stopSpinner();
    output.error(
      `Failed to create payment authorization: ${(error as Error).message}`
    );
    return 1;
  }
  output.stopSpinner();

  // Retry provisioning with authorization
  output.spinner('Provisioning resource...', 500);
  let provisionResponse: AutoProvisionResponse;
  try {
    provisionResponse = await autoProvisionResource(client, {
      integrationIdOrSlug: options.integrationIdOrSlug,
      productIdOrSlug: options.productIdOrSlug,
      name: options.name,
      metadata: options.metadata,
      source: options.source,
      billingPlanId: options.billingPlanId,
      authorizationId,
    });
  } catch (error) {
    output.stopSpinner();
    output.error(`Failed to provision resource: ${(error as Error).message}`);
    return 1;
  }
  output.stopSpinner();

  if (provisionResponse.kind === 'provisioned') {
    output.log(
      `${chalk.bold(provisionResponse.resource.name)} successfully provisioned`
    );
    if (provisionResponse.billingPlan) {
      output.log(`  Plan: ${provisionResponse.billingPlan.name}`);
    }
    return await maybeConnectToProject(
      client,
      provisionResponse.resource.id,
      provisionResponse.resource.name
    );
  }

  output.error('Unexpected response from server after payment authorization');
  return 1;
}
