import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import output from '../../output-manager';
import type Client from '../../util/client';
import { withGlobalFlags } from '../../util/agent-output';
import {
  AGENT_REASON,
  getExitCodeForReason,
} from '../../util/agent-output-constants';
import { printError } from '../../util/error';
import { type APIError, isAPIError } from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import {
  getProductArgument,
  isSlug,
} from '../../util/integration/billing-plan-error';
import { fetchBillingPlans } from '../../util/integration/fetch-billing-plans';
import { fetchIntegration } from '../../util/integration/fetch-integration';
import {
  isHiddenOnCreate,
  mergeMetadataSchemas,
} from '../../util/integration/format-schema-help';
import { parseMetadataFlags } from '../../util/integration/parse-metadata';
import type {
  BillingPlan,
  Integration,
  IntegrationProduct,
  Metadata,
} from '../../util/integration/types';
import { writeJsonError } from '../../util/observability/jsonl';
import cmd from '../../util/output/cmd';
import { remoteText } from '../../util/output/remote-text';
import table from '../../util/output/table';
import { validateJsonOutput } from '../../util/output-format';
import { IntegrationBillingPlansTelemetryClient } from '../../util/telemetry/commands/integration/billing-plans';
import { billingPlansSubcommand } from './command';

export interface BillingPlanSummary {
  id: string;
  name: string;
  description: string;
  /** `subscription`, or `prepayment` (credits bought up front). */
  type: string;
  cost: string | null;
  /** Pricing lines from the integration, such as usage rates. */
  details: { label: string; value?: string }[];
  /**
   * No payment method required: the rule auto-provision uses to pick the
   * free plan when `--billing-plan` is omitted.
   */
  free: boolean;
  /** The integration does not disable this plan for the current team. */
  available: boolean;
}

interface NextStep {
  command: string;
  when: string;
}

interface ProductBillingPlans {
  id: string;
  slug: string;
  name: string;
  /** The argument to pass to `integration add` for this product. */
  argument: string;
  plans: BillingPlanSummary[];
  /** Set when the plans request for this product failed. */
  error?: string;
  /** How to get plans when none came back, or the request failed. */
  next?: NextStep[];
}

interface Failure {
  reason: string;
  message: string;
  /** Rows under the headline, such as the API's own message. */
  detail?: string[];
  next?: NextStep[];
  data?: Record<string, unknown>;
}

/** At most this many items in a list inside an error. */
const LIST_LIMIT = 5;

/** Metadata keys that are safe to print in a suggested command. */
const METADATA_KEY = /^[A-Za-z0-9_.-]+$/;

export async function billingPlans(
  client: Client,
  args: string[]
): Promise<number> {
  let parsedArguments;
  try {
    parsedArguments = parseArguments(
      args,
      getFlagsSpecification(billingPlansSubcommand.options)
    );
  } catch (error) {
    printError(error);
    return 2;
  }
  const { flags } = parsedArguments;

  const telemetry = new IntegrationBillingPlansTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const metaFlags = flags['--meta'];
  telemetry.trackCliOptionMeta(metaFlags);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return fail(client, false, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: formatResult.error,
    });
  }
  const json = formatResult.jsonOutput;
  const command = (template: string) => withGlobalFlags(client, template);

  // Validate the argument before the first request.
  if (parsedArguments.args.length > 1) {
    return fail(client, json, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: 'Pass one integration at a time.',
      next: [
        {
          command: command('integration billing-plans --help'),
          when: 'See usage',
        },
      ],
    });
  }
  const rawArg = parsedArguments.args[0];
  if (!rawArg) {
    return fail(client, json, {
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message: 'Missing the integration to list billing plans for.',
      next: [
        {
          command: command('integration billing-plans <integration>'),
          when: 'Pass an integration slug',
        },
        {
          command: command('integration discover'),
          when: 'Find integration slugs',
        },
      ],
    });
  }
  const [integrationSlug, productSlug, ...extra] = rawArg.split('/');
  if (
    extra.length > 0 ||
    !isSlug(integrationSlug) ||
    (productSlug !== undefined && !isSlug(productSlug))
  ) {
    return fail(client, json, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: `Invalid integration ${remoteText(rawArg)}. Pass <integration> or <integration>/<product>, like neon or aws/aws-s3.`,
      next: [
        {
          command: command('integration discover'),
          when: 'Find integration and product slugs',
        },
      ],
    });
  }

  // Plans depend on the team (its installation, and what the integration
  // offers it), so resolve it the same way `integration add` does.
  const { team, contextName } = await getScope(client);
  if (!team) {
    return fail(client, json, {
      reason: AGENT_REASON.MISSING_SCOPE,
      message: 'No team selected. Billing plans depend on the team.',
      next: [
        {
          command: command(
            `integration billing-plans ${rawArg} --scope <TEAM>`
          ),
          when: 'Name the team',
        },
      ],
    });
  }
  client.config.currentTeam = team.id;

  if (!json && !client.nonInteractive) {
    output.spinner('Fetching billing plans…', 500);
  }

  let integration: Integration;
  try {
    integration = await fetchIntegration(client, integrationSlug);
  } catch (error) {
    telemetry.trackCliArgumentIntegration(integrationSlug);
    if (!isAPIError(error)) {
      throw error;
    }
    if (error.status === 404) {
      return fail(client, json, {
        reason: AGENT_REASON.NOT_FOUND,
        message: `Couldn't find integration ${integrationSlug}.`,
        next: [
          {
            command: command('integration discover'),
            when: 'Find integration slugs',
          },
        ],
      });
    }
    return fail(
      client,
      json,
      withApiMessage(error, {
        reason: AGENT_REASON.API_ERROR,
        message: `Couldn't fetch integration ${integrationSlug}.`,
      })
    );
  }
  telemetry.trackCliArgumentIntegration(integration.slug, true);

  const products = integration.products ?? [];
  if (products.length === 0) {
    return fail(client, json, {
      reason: AGENT_REASON.NOT_FOUND,
      message: `${integrationSlug} isn't a Marketplace integration, so it has no billing plans.`,
    });
  }
  const productArguments = products.map(p =>
    getProductArgument(integration, p)
  );

  let selected = products;
  if (productSlug) {
    const product = products.find(p => p.slug === productSlug);
    if (!product) {
      return fail(client, json, {
        reason: AGENT_REASON.NOT_FOUND,
        message: `Couldn't find product ${productSlug} in ${integrationSlug}.`,
        detail: [`Products: ${formatList(productArguments)}`],
        data: { products: productArguments },
        next: [
          {
            command: command(`integration billing-plans ${integrationSlug}`),
            when: 'List the billing plans of every product',
          },
        ],
      });
    }
    selected = [product];
  }

  let metadata: Metadata = {};
  if (metaFlags?.length) {
    // Each product has its own metadata keys.
    if (selected.length > 1) {
      return fail(client, json, {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `--meta needs one product. ${integrationSlug} has ${products.length}.`,
        detail: [`Products: ${formatList(productArguments)}`],
        data: { products: productArguments },
        next: [
          {
            command: command(
              `integration billing-plans ${integrationSlug}/<product> --meta <KEY=VALUE>`
            ),
            when: 'Name the product',
          },
        ],
      });
    }
    const parsed = parseProductMetadata(integration, selected[0], metaFlags);
    if ('errors' in parsed) {
      return fail(client, json, {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: 'Invalid --meta.',
        detail: parsed.errors.map(remoteText),
        data: { issues: parsed.errors },
        next: [
          {
            command: command(
              `integration add ${getProductArgument(integration, selected[0])} --help`
            ),
            when: 'See the metadata keys and values',
          },
        ],
      });
    }
    metadata = parsed.metadata;
  }

  const settled = await Promise.allSettled(
    selected.map(product =>
      fetchBillingPlans(client, integration, product, metadata)
    )
  );
  output.stopSpinner();

  const results: ProductBillingPlans[] = [];
  for (const [index, result] of settled.entries()) {
    const product = selected[index];
    const argument = getProductArgument(integration, product);
    if (result.status === 'rejected' && !isAPIError(result.reason)) {
      throw result.reason;
    }
    const plans =
      result.status === 'fulfilled'
        ? result.value.plans.map(summarizeBillingPlan)
        : [];
    const error =
      result.status === 'rejected'
        ? remoteText((result.reason as APIError).serverMessage || '') ||
          'The request failed.'
        : undefined;
    // Integrations that need a product's metadata to price it may return no
    // plans, or an error, without it.
    const next =
      plans.length === 0
        ? getMissingMetadataNext(client, product, argument, metadata)
        : undefined;
    results.push({
      id: product.id,
      slug: product.slug,
      name: product.name,
      argument,
      plans,
      ...(error !== undefined && { error }),
      ...(next && { next }),
    });
  }

  const failed = results.filter(product => product.error !== undefined);
  if (failed.length === results.length) {
    const [first] = failed;
    return fail(client, json, {
      reason: AGENT_REASON.API_ERROR,
      message: `Couldn't list the billing plans for ${results.length === 1 ? first.argument : integrationSlug}.`,
      detail: [`Vercel API: ${first.error}`],
      data: { remoteMessage: first.error },
      next: first.next,
    });
  }
  // Partial results are not success.
  const exitCode = failed.length > 0 ? 1 : 0;

  if (json) {
    client.stdout.write(
      `${JSON.stringify(
        {
          integration: {
            id: integration.id,
            slug: integration.slug,
            name: integration.name,
          },
          products: results,
        },
        null,
        2
      )}\n`
    );
    return exitCode;
  }

  printHumanResult(client, {
    results,
    integrationSlug,
    target: productSlug ? `${integrationSlug}/${productSlug}` : integrationSlug,
    contextName,
    showProduct: results.length > 1,
  });
  return exitCode;
}

function summarizeBillingPlan(plan: BillingPlan): BillingPlanSummary {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description ?? '',
    type: plan.type,
    cost: plan.cost?.trim() || null,
    details: (plan.details ?? []).map(({ label, value }) => ({
      label,
      value,
    })),
    free: plan.paymentMethodRequired === false,
    available: plan.disabled !== true,
  };
}

/**
 * Parses `--meta` like `integration add` does, against the product and
 * integration schemas, and keeps the product's keys: the plans request takes
 * product metadata only.
 */
function parseProductMetadata(
  integration: Integration,
  product: IntegrationProduct,
  metaFlags: string[]
): { metadata: Metadata } | { errors: string[] } {
  const schema = mergeMetadataSchemas(
    product.metadataSchema,
    integration.metadataSchema
  ) ?? { type: 'object' as const, properties: {} };
  const { metadata, errors } = parseMetadataFlags(metaFlags, schema);
  if (errors.length) {
    return { errors };
  }
  const productKeys = product.metadataSchema?.properties ?? {};
  return {
    metadata: Object.fromEntries(
      Object.entries(metadata).filter(([key]) =>
        Object.hasOwn(productKeys, key)
      )
    ),
  };
}

/**
 * The `--meta` retry for a product that returned no plans: its required keys
 * that were not passed and that a user sets (not hidden, no default).
 */
function getMissingMetadataNext(
  client: Client,
  product: IntegrationProduct,
  argument: string,
  metadata: Metadata
): NextStep[] | undefined {
  const schema = product.metadataSchema;
  if (!schema) {
    return undefined;
  }
  const missing = (schema.required ?? []).filter(key => {
    const property = Object.hasOwn(schema.properties, key)
      ? schema.properties[key]
      : undefined;
    return (
      property !== undefined &&
      !isHiddenOnCreate(property) &&
      property.default === undefined &&
      !Object.hasOwn(metadata, key) &&
      METADATA_KEY.test(key)
    );
  });
  if (missing.length === 0) {
    return undefined;
  }
  const flags = missing.map(key => `--meta ${key}=<VALUE>`).join(' ');
  return [
    {
      command: withGlobalFlags(
        client,
        `integration billing-plans ${argument} ${flags}`
      ),
      when: 'Pass the product metadata the integration may need to list plans',
    },
  ];
}

function printHumanResult(
  client: Client,
  {
    results,
    integrationSlug,
    target,
    contextName,
    showProduct,
  }: {
    results: ProductBillingPlans[];
    integrationSlug: string;
    /** The integration, or `<integration>/<product>`, as passed. */
    target: string;
    contextName: string;
    showProduct: boolean;
  }
) {
  const tty = Boolean(client.stdout.isTTY);
  const headers = [
    ...(showProduct ? ['Product'] : []),
    'Plan ID',
    'Name',
    'Type',
    'Price',
    'Available',
  ];
  const rows = results.flatMap(product =>
    product.plans.map(plan => [
      ...(showProduct ? [product.argument] : []),
      remoteText(plan.id),
      remoteText(plan.name),
      remoteText(plan.type),
      formatPrice(plan),
      plan.available ? 'Yes' : 'No',
    ])
  );

  if (rows.length > 0 && tty) {
    output.print(
      `  Billing plans for ${target} in ${remoteText(contextName)}\n\n`
    );
  }
  if (!tty) {
    client.stdout.write(
      `${[headers, ...rows]
        .map(row => row.map(cell => stripAnsi(cell)).join('\t'))
        .join('\n')}\n`
    );
  } else if (rows.length > 0) {
    client.stdout.write(
      `${table([headers.map(header => chalk.dim(header)), ...rows], {
        hsep: 3,
      })
        .split('\n')
        .map(line => `  ${line}`.trimEnd())
        .join('\n')}\n`
    );
  }

  for (const product of results) {
    if (product.plans.length > 0) {
      continue;
    }
    const label = showProduct
      ? `${remoteText(product.name)} (${product.argument})`
      : remoteText(product.name);
    if (product.error !== undefined) {
      output.warning(
        `Couldn't list the billing plans for ${label}.\nVercel API: ${product.error}`
      );
    } else {
      output.print(`  No billing plans for ${label}.\n`);
    }
    for (const step of product.next ?? []) {
      output.print(`\n  ${step.when}:\n    ${cmd(step.command)}\n`);
    }
  }

  if (rows.length > 0) {
    const withPlans = results.filter(product => product.plans.length > 0);
    const argument =
      withPlans.length === 1
        ? withPlans[0].argument
        : `${integrationSlug}/<product>`;
    const install = withGlobalFlags(
      client,
      `integration add ${argument} --billing-plan <BILLING_PLAN>`
    );
    output.print(`\n  Install with a billing plan:\n    ${cmd(install)}\n`);
  }
}

function formatPrice(plan: BillingPlanSummary): string {
  if (plan.free) {
    return 'Free';
  }
  return plan.cost ? `Paid (${remoteText(plan.cost)})` : 'Paid';
}

/** Lists up to `LIST_LIMIT` items, then how many more there are. */
function formatList(items: string[]): string {
  const shown = items.slice(0, LIST_LIMIT).join(', ');
  const more = items.length - LIST_LIMIT;
  return more > 0 ? `${shown}, and ${more} more` : shown;
}

/**
 * The API's own message is remote text, so it only appears in an attributed
 * detail row and in `data.remoteMessage`.
 */
function withApiMessage(error: APIError, failure: Failure): Failure {
  const remote = error.serverMessage ? remoteText(error.serverMessage) : '';
  if (!remote) {
    return failure;
  }
  return {
    ...failure,
    detail: [...(failure.detail ?? []), `Vercel API: ${remote}`],
    data: { ...failure.data, remoteMessage: remote },
  };
}

/**
 * Reports a failure and returns its exit code, which follows the reason.
 * With `--json` or in a non-interactive run, the error is a JSON document on
 * stderr so agents and scripts can branch on `reason`.
 */
function fail(client: Client, json: boolean, failure: Failure): number {
  output.stopSpinner();
  const exitCode = getExitCodeForReason(failure.reason);
  if (json || client.nonInteractive) {
    return writeJsonError(
      client,
      {
        status: 'error',
        reason: failure.reason,
        message: failure.message,
        ...(failure.next?.length ? { next: failure.next } : {}),
        ...(failure.data ? { data: failure.data } : {}),
      },
      exitCode
    );
  }
  output.fatal(failure.message);
  for (const line of failure.detail ?? []) {
    output.print(`  ${line}\n`);
  }
  for (const step of failure.next ?? []) {
    output.print(`\n  ${step.when}:\n    ${cmd(step.command)}\n`);
  }
  return exitCode;
}
