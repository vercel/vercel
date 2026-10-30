import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { printError } from '../../util/error';
import { sanitizeForTerminal } from '../../util/connex/sanitize';
import table from '../../util/output/table';
import { packageName } from '../../util/pkg-name';
import { printNextPageCommand } from '../../util/pagination';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/** The parts of a `GET /v1/connect/services` row the CLI reads. */
interface ConnexServiceSummary {
  service: string;
  name: string;
  description?: string;
  website?: string;
  docsite?: string;
  beta?: boolean;
  categories: string[];
  targets?: { target: string; label: string }[];
  connectionMethods?: { connectionMethod: string }[];
  supportsTriggers: boolean;
}

interface ListServicesResponse {
  services: ConnexServiceSummary[];
  pagination: { next: string | null };
}

export interface DiscoverFlags {
  '--category'?: string[];
  '--connection-method'?: string[];
  '--target'?: string[];
  '--supports-triggers'?: boolean;
  '--limit'?: number;
  '--next'?: string;
  '--format'?: string;
  '--json'?: boolean;
}

function splitValues(values: string[] | undefined): string[] {
  return (values ?? [])
    .flatMap(v => v.split(',').map(s => s.trim()))
    .filter(Boolean);
}

export async function discover(
  client: Client,
  args: string[],
  flags: DiscoverFlags
): Promise<number> {
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  if (args.length > 1) {
    output.error(
      `Too many arguments. Usage: \`${packageName} connect discover [query]\``
    );
    return 2;
  }
  const query = args[0];

  let limit = flags['--limit'] ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    output.error('--limit must be a whole number of 1 or more.');
    return 2;
  }
  if (limit > MAX_LIMIT) {
    output.warning(`--limit is capped at ${MAX_LIMIT}. Showing ${MAX_LIMIT}.`);
    limit = MAX_LIMIT;
  }

  const categories = splitValues(flags['--category']);
  const connectionMethods = splitValues(flags['--connection-method']);
  const targets = splitValues(flags['--target']);

  const params = new URLSearchParams();
  if (query) params.set('query', query);
  if (categories.length) params.set('category', categories.join(','));
  if (connectionMethods.length) {
    params.set('connectionMethod', connectionMethods.join(','));
  }
  if (targets.length) params.set('target', targets.join(','));
  if (flags['--supports-triggers']) params.set('supportsTriggers', 'true');
  params.set('limit', String(limit));
  if (flags['--next']) params.set('cursor', flags['--next']);

  output.spinner('Fetching services…');
  let response: ListServicesResponse;
  try {
    response = await client.fetch<ListServicesResponse>(
      `/v1/connect/services?${params}`,
      { teamOptional: true }
    );
  } catch (err: unknown) {
    output.stopSpinner();
    printError(err, client);
    return 1;
  }
  output.stopSpinner();

  const services = response.services ?? [];
  const next = response.pagination?.next ?? null;

  if (services.length === 0) {
    const unknown = await unknownCategories(client, categories);
    if (unknown.length > 0) {
      output.error(
        `Unknown ${unknown.length === 1 ? 'category' : 'categories'}: ${unknown.map(c => `"${sanitizeForTerminal(c)}"`).join(', ')}. Run \`${packageName} connect categories\` to see the valid slugs.`
      );
      return 2;
    }
  }

  if (asJson) {
    const jsonServices = services.map(s => ({
      service: s.service,
      name: s.name,
      description: s.description ?? null,
      categories: s.categories,
      connectionMethods: (s.connectionMethods ?? []).map(
        m => m.connectionMethod
      ),
      targets: (s.targets ?? []).map(t => t.target),
      supportsTriggers: s.supportsTriggers,
      beta: s.beta === true,
      website: s.website ?? null,
      docsite: s.docsite ?? null,
    }));
    client.stdout.write(
      `${JSON.stringify({ services: jsonServices, pagination: { next } }, null, 2)}\n`
    );
    return 0;
  }

  if (services.length === 0) {
    output.log(
      query
        ? `No services matching "${sanitizeForTerminal(query)}" found.`
        : 'No services found.'
    );
    return 0;
  }

  const useCompactFormat =
    client.stderr.columns > 0 && client.stderr.columns < 120;
  output.print(
    `${useCompactFormat ? formatCompactList(services) : formatTable(services)}\n`
  );

  output.log(
    `Run \`${packageName} connect create <service>\` to create a connector.`
  );

  if (next) {
    const parts = [`${packageName} connect discover`];
    if (query) parts.push(JSON.stringify(query));
    for (const c of categories) parts.push(`--category ${c}`);
    for (const m of connectionMethods) parts.push(`--connection-method ${m}`);
    for (const t of targets) parts.push(`--target ${t}`);
    if (flags['--supports-triggers']) parts.push('--supports-triggers');
    if (flags['--limit'] !== undefined) parts.push(`--limit ${limit}`);
    parts.push(`--next ${next}`);
    output.print('\n');
    printNextPageCommand(parts.join(' '));
  }
  return 0;
}

function methodsOf(s: ConnexServiceSummary): string {
  const methods = (s.connectionMethods ?? []).map(m => m.connectionMethod);
  return methods.length ? methods.join(', ') : chalk.gray('–');
}

/**
 * The API returns nothing for a category slug it doesn't know, so an empty
 * result is the only point where a typo can be told apart from no matches.
 */
async function unknownCategories(
  client: Client,
  categories: string[]
): Promise<string[]> {
  if (categories.length === 0) {
    return [];
  }
  try {
    const response = await client.fetch<{ categories: { slug: string }[] }>(
      '/v1/connect/services/categories',
      { teamOptional: true }
    );
    const known = new Set((response.categories ?? []).map(c => c.slug));
    return categories.filter(c => !known.has(c));
  } catch {
    return [];
  }
}

function formatTable(services: ConnexServiceSummary[]): string {
  return table(
    [
      ['Service', 'Name', 'Methods', 'Description'].map(h =>
        chalk.bold(chalk.cyan(h))
      ),
      ...services.map(s => [
        sanitizeForTerminal(s.service),
        sanitizeForTerminal(s.name),
        methodsOf(s),
        s.description ? sanitizeForTerminal(s.description) : chalk.gray('–'),
      ]),
    ],
    { hsep: 4 }
  );
}

function formatCompactList(services: ConnexServiceSummary[]): string {
  return services
    .map(s =>
      [
        `${chalk.bold(sanitizeForTerminal(s.name))} (${sanitizeForTerminal(s.service)})`,
        `  Methods: ${methodsOf(s)}`,
        `  Description: ${s.description ? sanitizeForTerminal(s.description) : '–'}`,
      ].join('\n')
    )
    .join('\n\n');
}
