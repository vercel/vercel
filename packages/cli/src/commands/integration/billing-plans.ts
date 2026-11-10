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
import { isAPIError } from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { getProductArgument } from '../../util/integration/billing-plan-error';
import { fetchBillingPlans } from '../../util/integration/fetch-billing-plans';
import { fetchIntegration } from '../../util/integration/fetch-integration';
import { isHelpSelector } from '../../util/integration/format-help-selector';
import {
  formatMetadataExample,
  isHiddenOnCreate,
  isSafeMetadataKey,
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

/** A plan as the API returns it, plus two answers derived from it. */
export type BillingPlanResult = BillingPlan & {
  /**
   * No payment method required: the rule auto-provision uses to pick the
   * free plan when `--billing-plan` is omitted.
   */
  free: boolean;
  /** The integration does not disable this plan for the current team. */
  available: boolean;
};

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
  plans: BillingPlanResult[];
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

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export async function billingPlans(
  client: Client,
  args: string[]
): Promise<number> {
  // Known before parsing, so even a parse error is a JSON document.
  const json = args.some(
    (arg, index) =>
      arg === '--json' ||
      arg === '--format=json' ||
      ((arg === '--format' || arg === '-F') && args[index + 1] === 'json')
  );
  try {
    return await listBillingPlans(client, args, json);
  } catch (error) {
    if (isNetworkError(error)) {
      return fail(client, json, {
        reason: AGENT_REASON.NETWORK_ERROR,
        message: "Couldn't reach the Vercel API. The connection failed.",
      });
    }
    if (json || client.nonInteractive) {
      output.stopSpinner();
      return writeJsonError(
        client,
        {
          status: 'error',
          reason: 'internal_error',
          message:
            'Unexpected error in vercel integration billing-plans. This is a bug in Vercel CLI.',
        },
        1
      );
    }
    output.stopSpinner();
    printError(error, client);
    return 1;
  }
}

async function listBillingPlans(
  client: Client,
  args: string[],
  jsonRequested: boolean
): Promise<number> {
  const command = (template: string) => withGlobalFlags(client, template);
  const usage: NextStep = {
    command: command('integration billing-plans --help'),
    when: 'See usage',
  };

  let parsedArguments;
  try {
    parsedArguments = parseArguments(
      args,
      getFlagsSpecification(billingPlansSubcommand.options)
    );
  } catch (error) {
    return fail(client, jsonRequested, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: error instanceof Error ? error.message : String(error),
      next: [usage],
    });
  }
  const { flags } = parsedArguments;

  const telemetry = new IntegrationBillingPlansTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const metaFlags = flags['--meta'] ?? [];
  telemetry.trackCliOptionMeta(metaFlags);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return fail(client, jsonRequested, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: formatResult.error,
      next: [usage],
    });
  }
  const json = formatResult.jsonOutput;

  // Validate the argument before the first request.
  if (parsedArguments.args.length > 1) {
    return fail(client, json, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: 'Pass one integration at a time.',
      next: [usage],
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
    !isHelpSelector(integrationSlug) ||
    (productSlug !== undefined && !isHelpSelector(productSlug))
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
  // The user's `--meta`, for the commands this suggests.
  const metaSuggestion = metaFlags.map(formatMetaFlag);

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
    const remote = remoteText(error.serverMessage || '');
    return fail(client, json, {
      reason: AGENT_REASON.API_ERROR,
      message: `Couldn't fetch integration ${integrationSlug}.`,
      ...(remote && {
        detail: [`Vercel API: ${remote}`],
        data: { remoteMessage: remote },
      }),
    });
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
  if (metaFlags.length > 0) {
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
              `integration billing-plans ${integrationSlug}/<product> ${metaSuggestion.join(' ')}`
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
        data: {
          issues: parsed.errors.map(message => ({
            field: 'meta',
            reason: AGENT_REASON.INVALID_ARGUMENTS,
            message,
          })),
        },
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
  /** Failures whose message came from the API, so it's labeled as such. */
  const remoteErrors = new Set<ProductBillingPlans>();
  for (const [index, result] of settled.entries()) {
    const product = selected[index];
    const argument = getProductArgument(integration, product);
    let plans: BillingPlanResult[] = [];
    let error: string | undefined;
    let remote = false;
    if (result.status === 'fulfilled') {
      const returned = result.value?.plans;
      plans = Array.isArray(returned) ? returned.map(withAnswers) : [];
    } else if (isAPIError(result.reason)) {
      const message = remoteText(result.reason.serverMessage || '');
      remote = message !== '';
      error = message || `The Vercel API returned ${result.reason.status}.`;
    } else if (isNetworkError(result.reason)) {
      error = "Couldn't reach the Vercel API. The connection failed.";
    } else {
      throw result.reason;
    }
    // Integrations that need a product's metadata to price it may return no
    // plans, or an error, without it.
    const next =
      plans.length === 0
        ? getMissingMetadataNext(
            client,
            product,
            argument,
            metadata,
            metaSuggestion
          )
        : undefined;
    const entry: ProductBillingPlans = {
      id: product.id,
      slug: product.slug,
      name: product.name,
      argument,
      plans,
      ...(error !== undefined && { error }),
      ...(next && { next }),
    };
    if (remote) {
      remoteErrors.add(entry);
    }
    results.push(entry);
  }

  const describeError = (product: ProductBillingPlans) =>
    remoteErrors.has(product)
      ? `Vercel API: ${product.error}`
      : (product.error ?? '');

  const failed = results.filter(product => product.error !== undefined);
  if (failed.length === results.length) {
    const single = results.length === 1;
    return fail(client, json, {
      reason: AGENT_REASON.API_ERROR,
      message: `Couldn't list the billing plans for ${single ? results[0].argument : integrationSlug}.`,
      detail: failed.map(product =>
        single
          ? describeError(product)
          : `${product.argument}: ${describeError(product)}`
      ),
      data: {
        products: failed.map(product => ({
          argument: product.argument,
          error: product.error,
        })),
      },
      next: failed.flatMap(product => product.next ?? []),
    });
  }

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
  } else {
    printHumanResult(client, {
      results,
      integrationSlug,
      target: productSlug
        ? `${integrationSlug}/${productSlug}`
        : integrationSlug,
      contextName,
      metaSuggestion,
      describeError,
    });
  }
  // Partial results are not success.
  return failed.length > 0 ? 1 : 0;
}

function withAnswers(plan: BillingPlan): BillingPlanResult {
  return {
    ...plan,
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

/** A `--meta KEY=VALUE` as typed, made safe to print in a command. */
function formatMetaFlag(raw: string): string {
  const eq = raw.indexOf('=');
  return eq === -1
    ? formatMetadataExample(raw, '')
    : formatMetadataExample(raw.slice(0, eq).trim(), raw.slice(eq + 1).trim());
}

/**
 * The `--meta` retry for a product that returned no plans: the `--meta` the
 * user passed, plus the required keys a user sets (declared, not hidden, no
 * default) that are still missing.
 */
function getMissingMetadataNext(
  client: Client,
  product: IntegrationProduct,
  argument: string,
  metadata: Metadata,
  metaSuggestion: string[]
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
      isSafeMetadataKey(key)
    );
  });
  if (missing.length === 0) {
    return undefined;
  }
  const flags = [
    ...metaSuggestion,
    ...missing.map(key => formatMetadataExample(key, '<VALUE>')),
  ].join(' ');
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
    metaSuggestion,
    describeError,
  }: {
    results: ProductBillingPlans[];
    integrationSlug: string;
    /** The integration, or `<integration>/<product>`, as passed. */
    target: string;
    contextName: string;
    metaSuggestion: string[];
    describeError: (product: ProductBillingPlans) => string;
  }
) {
  const showProduct = results.length > 1;
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
      output.print('\n');
      output.fatal(
        `Couldn't list the billing plans for ${label}.\n${describeError(product)}`
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
      [
        `integration add ${argument} --billing-plan <BILLING_PLAN>`,
        ...metaSuggestion,
      ].join(' ')
    );
    output.print(`\n  Install with a billing plan:\n    ${cmd(install)}\n`);
  }
}

function formatPrice(plan: BillingPlanResult): string {
  if (plan.free) {
    return 'Free';
  }
  const cost = plan.cost?.trim();
  return cost ? `Paid (${remoteText(cost)})` : 'Paid';
}

/** Lists up to `LIST_LIMIT` items, then how many more there are. */
function formatList(items: string[]): string {
  const shown = items.slice(0, LIST_LIMIT).join(', ');
  const more = items.length - LIST_LIMIT;
  return more > 0 ? `${shown}, and ${more} more` : shown;
}

/** A request that never got a response (offline, DNS, timeout). */
function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error) || isAPIError(error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  const cause = (error as { cause?: { code?: unknown } }).cause;
  return (
    (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) ||
    (typeof cause?.code === 'string' && NETWORK_ERROR_CODES.has(cause.code)) ||
    error.name === 'FetchError' ||
    error.name === 'AbortError' ||
    error.name === 'TimeoutError' ||
    /fetch failed/i.test(error.message)
  );
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
