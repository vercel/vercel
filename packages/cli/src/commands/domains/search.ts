import { URLSearchParams } from 'url';
import { z } from 'zod';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import output from '../../output-manager';
import table from '../../util/output/table';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandName } from '../../util/pkg-name';
import { searchSubcommand } from './command';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;
const DEFAULT_ORDER = 'relevance';
const ORDERS = ['relevance', 'alphabetical', 'length'] as const;
const SUPPORTED_TLDS_CACHE_FILE = 'cache/domains-search-supported-tlds.json';
const SUPPORTED_TLDS_CACHE_TTL_MS = 30 * 60 * 1000;

type SupportedTldsOrder = (typeof ORDERS)[number];

const supportedTldsSchema = z.array(z.string());
const supportedTldsCacheSchema = z.object({
  entries: z.record(
    z.string(),
    z.object({
      fetchedAt: z.number(),
      tlds: supportedTldsSchema,
    })
  ),
});

type DomainCandidate = {
  domain: string;
  available: boolean;
  purchasePrice: number | null;
  renewalPrice: number | null;
  years: number | null;
};

const domainSearchResultSchema = z.discriminatedUnion('available', [
  z.object({
    domain: z.string(),
    available: z.literal(false),
  }),
  z.object({
    domain: z.string(),
    available: z.literal(true),
    years: z.number(),
    price: z.number(),
    renewalPrice: z.number(),
    premium: z.boolean(),
  }),
]);

const domainsSearchResponseSchema = z.object({
  results: z.array(domainSearchResultSchema),
});

type ContinuationCursor = {
  query: string;
  fragment: string | null;
  order: SupportedTldsOrder;
  tlds: string[];
  availableOnly: boolean;
  lastTld: string;
};

export default async function search(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(searchSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  const queryResult = normalizeQuery(parsedArgs.args);
  if (!queryResult.valid) {
    output.error(queryResult.error);
    return 1;
  }

  const orderResult = getOrder(parsedArgs.flags['--order']);
  if (!orderResult.valid) {
    output.error(orderResult.error);
    return 1;
  }

  const limitResult = getLimit(parsedArgs.flags['--limit']);
  if (!limitResult.valid) {
    output.error(limitResult.error);
    return 1;
  }

  const tldsResult = normalizeTldFilters(parsedArgs.flags['--tld']);
  if (!tldsResult.valid) {
    output.error(tldsResult.error);
    return 1;
  }

  const { query, keyword, fragment } = queryResult;
  const order = orderResult.order;
  const limit = limitResult.limit;
  const tlds = tldsResult.tlds;
  const availableOnly = parsedArgs.flags['--available'] ?? false;
  const cursorResult = decodeCursor(parsedArgs.flags['--next']);
  if (!cursorResult.valid) {
    output.error(cursorResult.error);
    return 1;
  }

  const cursor = cursorResult.cursor;
  if (
    cursor &&
    (cursor.query !== query ||
      cursor.fragment !== fragment ||
      cursor.order !== order ||
      !areStringArraysEqual(cursor.tlds, tlds) ||
      cursor.availableOnly !== availableOnly)
  ) {
    output.error(
      'The continuation cursor does not match the current query, order, or filters.'
    );
    return 1;
  }

  try {
    const supportedTlds = await getSupportedTlds(client, order);
    const matchingTlds = filterTlds(supportedTlds, fragment, tlds, order);
    const offsetResult = getOffset(matchingTlds, cursor);
    if (!offsetResult.valid) {
      output.error(offsetResult.error);
      return 1;
    }

    const page = await getCandidatePage(
      client,
      keyword,
      matchingTlds,
      offsetResult.offset,
      limit,
      availableOnly
    );
    const next =
      page.lastTld !== null && page.hasMore
        ? encodeCursor({
            query,
            fragment,
            order,
            tlds,
            availableOnly,
            lastTld: page.lastTld,
          })
        : null;

    if (formatResult.jsonOutput) {
      client.stdout.write(
        `${JSON.stringify(
          {
            query,
            order,
            results: page.results,
            pagination: {
              next,
              limit,
            },
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    output.log(renderTable(page.results));
    if (next) {
      output.log('');
      output.log(
        `To continue, run ${getCommandName(getContinuationCommand(query, order, tlds, availableOnly, next))}`
      );
    }
    return 0;
  } catch (error) {
    if (isAPIError(error)) {
      const message = error.serverMessage || `API error (${error.status})`;
      if (formatResult.jsonOutput) {
        client.stdout.write(
          `${JSON.stringify(
            { error: error.code || 'api_error', message },
            null,
            2
          )}\n`
        );
      } else {
        output.error(message);
      }
      return 1;
    }

    printError(error);
    return 1;
  }
}

async function getSupportedTlds(
  client: Client,
  order: SupportedTldsOrder
): Promise<string[]> {
  const cache = await client.maybeReadConfig(
    SUPPORTED_TLDS_CACHE_FILE,
    supportedTldsCacheSchema
  );
  const cacheKey = JSON.stringify([client.config.currentTeam ?? null, order]);
  const cachedEntry = cache?.entries[cacheKey];
  if (cachedEntry && isSupportedTldsCacheEntryFresh(cachedEntry.fetchedAt)) {
    output.debug('Using cached supported TLD catalog');
    return cachedEntry.tlds;
  }

  const params = new URLSearchParams({ order });
  const supportedTlds = supportedTldsSchema.parse(
    await client.fetch<unknown>(`/v1/registrar/tlds/supported?${params}`)
  );

  try {
    const fetchedAt = Date.now();
    const freshEntries = Object.fromEntries(
      Object.entries(cache?.entries ?? {}).filter(([, entry]) =>
        isSupportedTldsCacheEntryFresh(entry.fetchedAt, fetchedAt)
      )
    );
    await client.writeConfig(
      SUPPORTED_TLDS_CACHE_FILE,
      supportedTldsCacheSchema,
      {
        entries: {
          ...freshEntries,
          [cacheKey]: {
            fetchedAt,
            tlds: supportedTlds,
          },
        },
      }
    );
  } catch (error) {
    output.debug(`Failed to cache supported TLD catalog: ${error}`);
  }

  return supportedTlds;
}

function isSupportedTldsCacheEntryFresh(
  fetchedAt: number,
  now = Date.now()
): boolean {
  const age = now - fetchedAt;
  return age >= 0 && age <= SUPPORTED_TLDS_CACHE_TTL_MS;
}

function encodeCursor(cursor: ContinuationCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(
  value: string | undefined
):
  | { valid: true; cursor: ContinuationCursor | null }
  | { valid: false; error: string } {
  if (value === undefined) {
    return { valid: true, cursor: null };
  }

  try {
    if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new Error('Invalid base64url value');
    }

    const cursor: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8')
    );
    if (!isContinuationCursor(cursor)) {
      throw new Error('Invalid cursor shape');
    }
    return { valid: true, cursor };
  } catch {
    return {
      valid: false,
      error:
        'Invalid continuation cursor. Run Domain Discovery again without `--next`.',
    };
  }
}

function isContinuationCursor(value: unknown): value is ContinuationCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const cursor = value as Record<string, unknown>;
  const keys = Object.keys(cursor).sort();
  if (
    keys.length !== 6 ||
    keys.join(',') !== 'availableOnly,fragment,lastTld,order,query,tlds'
  ) {
    return false;
  }

  return (
    typeof cursor.query === 'string' &&
    (typeof cursor.fragment === 'string' || cursor.fragment === null) &&
    typeof cursor.order === 'string' &&
    ORDERS.includes(cursor.order as SupportedTldsOrder) &&
    Array.isArray(cursor.tlds) &&
    cursor.tlds.every(tld => typeof tld === 'string') &&
    typeof cursor.availableOnly === 'boolean' &&
    typeof cursor.lastTld === 'string' &&
    cursor.lastTld.length > 0
  );
}

function getOffset(
  tlds: string[],
  cursor: ContinuationCursor | null
): { valid: true; offset: number } | { valid: false; error: string } {
  if (!cursor) {
    return { valid: true, offset: 0 };
  }

  const lastTldIndex = tlds.indexOf(cursor.lastTld);
  if (lastTldIndex === -1) {
    return {
      valid: false,
      error:
        'The continuation cursor is stale. Run Domain Discovery again without `--next`.',
    };
  }

  return { valid: true, offset: lastTldIndex + 1 };
}

function normalizeQuery(
  args: string[]
):
  | { valid: true; query: string; keyword: string; fragment: string | null }
  | { valid: false; error: string } {
  if (args.length === 0) {
    return {
      valid: false,
      error: 'Missing query. Usage: `vercel domains search <query>`',
    };
  }

  if (args.length > 1) {
    return {
      valid: false,
      error: 'Please provide one keyword or domain fragment.',
    };
  }

  const query = args[0].trim().toLowerCase();
  if (query.length === 0) {
    return { valid: false, error: 'Query cannot be empty.' };
  }
  if (!/^[\x00-\x7F]+$/.test(query)) {
    return {
      valid: false,
      error: 'Only ASCII queries are supported in Domain Discovery.',
    };
  }
  if (query.includes('://') || /[/?#]/.test(query)) {
    return {
      valid: false,
      error: 'URLs are not supported. Provide one keyword or domain fragment.',
    };
  }
  if (/\s/.test(query)) {
    return {
      valid: false,
      error:
        'Queries cannot contain whitespace. Provide one keyword or domain fragment.',
    };
  }

  const [keyword, ...fragmentParts] = query.split('.');
  const fragment = fragmentParts.length > 0 ? fragmentParts.join('.') : null;
  if (!isValidLabel(keyword)) {
    return {
      valid: false,
      error: `Invalid keyword: "${keyword}".`,
    };
  }
  if (fragment !== null && !fragment.split('.').every(isValidLabel)) {
    return {
      valid: false,
      error: `Invalid TLD fragment: "${fragment}".`,
    };
  }

  return { valid: true, query, keyword, fragment };
}

function isValidLabel(value: string): boolean {
  return value.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
}

function getOrder(
  value: string | undefined
):
  | { valid: true; order: SupportedTldsOrder }
  | { valid: false; error: string } {
  const order = value ?? DEFAULT_ORDER;
  if (!ORDERS.includes(order as SupportedTldsOrder)) {
    return {
      valid: false,
      error: `Invalid order: "${order}". Valid orders: ${ORDERS.join(', ')}`,
    };
  }
  return { valid: true, order: order as SupportedTldsOrder };
}

function getContinuationCommand(
  query: string,
  order: SupportedTldsOrder,
  tlds: string[],
  availableOnly: boolean,
  cursor: string
): string {
  const flags: string[] = [];
  if (order !== DEFAULT_ORDER) {
    flags.push(`--order=${order}`);
  }
  flags.push(...tlds.map(tld => `--tld=${tld}`));
  if (availableOnly) {
    flags.push('--available');
  }
  flags.push(`--next ${cursor}`);

  return `domains search ${query} ${flags.join(' ')}`;
}

function normalizeTldFilters(
  values: string[] | undefined
): { valid: true; tlds: string[] } | { valid: false; error: string } {
  if (values === undefined) {
    return { valid: true, tlds: [] };
  }

  const tlds = Array.from(
    new Set(values.map(value => value.trim().toLowerCase().replace(/^\./, '')))
  ).sort();
  const invalidTld = tlds.find(
    tld => tld.length === 0 || !tld.split('.').every(isValidLabel)
  );
  if (invalidTld !== undefined) {
    return {
      valid: false,
      error: `Invalid TLD filter: "${invalidTld}".`,
    };
  }

  return { valid: true, tlds };
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function getLimit(
  value: number | undefined
): { valid: true; limit: number } | { valid: false; error: string } {
  const limit = value ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return {
      valid: false,
      error: `Invalid limit: "${limit}". Provide a number from 1 to ${MAX_LIMIT}.`,
    };
  }
  return { valid: true, limit };
}

function filterTlds(
  tlds: string[],
  fragment: string | null,
  filters: string[],
  order: SupportedTldsOrder
): string[] {
  const filterSet = new Set(filters);
  const matchingTlds = tlds.filter(
    tld =>
      (fragment === null || tld.startsWith(fragment)) &&
      (filterSet.size === 0 || filterSet.has(tld))
  );
  return order === 'relevance'
    ? matchingTlds.sort((a, b) =>
        a === fragment ? -1 : b === fragment ? 1 : 0
      )
    : matchingTlds;
}

async function getCandidatePage(
  client: Client,
  keyword: string,
  tlds: string[],
  offset: number,
  limit: number,
  availableOnly: boolean
): Promise<{
  results: DomainCandidate[];
  lastTld: string | null;
  hasMore: boolean;
}> {
  const pageTlds = tlds.slice(offset, offset + limit);
  const candidates = await quoteCandidates(
    client,
    pageTlds.map(tld => `${keyword}.${tld}`)
  );

  return {
    results: availableOnly
      ? candidates.filter(candidate => candidate.available)
      : candidates,
    lastTld: pageTlds.at(-1) ?? null,
    hasMore: offset + pageTlds.length < tlds.length,
  };
}

async function quoteCandidates(
  client: Client,
  domains: string[]
): Promise<DomainCandidate[]> {
  if (domains.length === 0) {
    return [];
  }

  const response = domainsSearchResponseSchema.parse(
    await client.fetch<unknown>('/v1/registrar/domains/search', {
      method: 'POST',
      body: {
        domains,
      },
    })
  );
  const resultsByDomain = new Map(
    response.results.map(result => [result.domain, result])
  );

  return domains.map(domain => {
    const result = resultsByDomain.get(domain);
    if (!result) {
      throw new Error(`Missing registrar search result for ${domain}.`);
    }
    if (!result.available) {
      return {
        domain: result.domain,
        available: false,
        purchasePrice: null,
        renewalPrice: null,
        years: null,
      };
    }
    return {
      domain: result.domain,
      available: true,
      purchasePrice: result.price,
      renewalPrice: result.renewalPrice,
      years: result.years,
    };
  });
}

function renderTable(results: DomainCandidate[]): string {
  return table([
    ['Domain', 'Availability', 'Purchase', 'Renewal'],
    ...results.map(result => [
      result.domain,
      result.available ? 'Available' : 'Unavailable',
      result.available ? formatPrice(result.purchasePrice, result.years) : '-',
      result.available ? formatPrice(result.renewalPrice, result.years) : '-',
    ]),
  ]);
}

function formatPrice(price: number | null, years: number | null): string {
  if (price === null || years === null) {
    return '-';
  }
  return `$${price} / ${years} ${years === 1 ? 'year' : 'years'}`;
}
