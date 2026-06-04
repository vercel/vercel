import { URLSearchParams } from 'url';
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
const MAX_LIMIT = 50;
const DEFAULT_ORDER = 'relevance';
const ORDERS = ['relevance', 'alphabetical', 'length'] as const;

type SupportedTldsOrder = (typeof ORDERS)[number];

type DomainPriceQuote = {
  domain: string;
  purchasePrice: number | null;
  renewalPrice: number | null;
  transferPrice: number | null;
  years: number;
};

type DomainCandidate = {
  domain: string;
  available: boolean;
  purchasePrice: number | null;
  renewalPrice: number | null;
  years: number | null;
};

type BulkDomainPriceResponse =
  | DomainPriceQuote[]
  | {
      results: DomainPriceQuote[];
    };

type ContinuationCursor = {
  query: string;
  fragment: string | null;
  order: SupportedTldsOrder;
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

  const { query, keyword, fragment } = queryResult;
  const order = orderResult.order;
  const limit = limitResult.limit;
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
      cursor.order !== order)
  ) {
    output.error(
      'The continuation cursor does not match the current query or order.'
    );
    return 1;
  }

  try {
    const params = new URLSearchParams({ order });
    const supportedTlds = await client.fetch<string[]>(
      `/v1/registrar/tlds/supported?${params}`
    );
    const matchingTlds = filterTlds(supportedTlds, fragment, order);
    const offsetResult = getOffset(matchingTlds, cursor);
    if (!offsetResult.valid) {
      output.error(offsetResult.error);
      return 1;
    }

    const offset = offsetResult.offset;
    const page = matchingTlds.slice(offset, offset + limit);
    const next =
      page.length > 0 && offset + page.length < matchingTlds.length
        ? encodeCursor({
            query,
            fragment,
            order,
            lastTld: page[page.length - 1],
          })
        : null;
    const results = await quoteCandidates(
      client,
      page.map(tld => `${keyword}.${tld}`)
    );

    if (formatResult.jsonOutput) {
      client.stdout.write(
        `${JSON.stringify(
          {
            query,
            order,
            results,
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

    output.log(renderTable(results));
    if (next) {
      output.log('');
      output.log(
        `To continue, run ${getCommandName(getContinuationCommand(query, order, next))}`
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
  if (keys.length !== 4 || keys.join(',') !== 'fragment,lastTld,order,query') {
    return false;
  }

  return (
    typeof cursor.query === 'string' &&
    (typeof cursor.fragment === 'string' || cursor.fragment === null) &&
    typeof cursor.order === 'string' &&
    ORDERS.includes(cursor.order as SupportedTldsOrder) &&
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
  cursor: string
): string {
  const flags = [`--next ${cursor}`];
  if (order !== DEFAULT_ORDER) {
    flags.unshift(`--order=${order}`);
  }

  return `domains search ${query} ${flags.join(' ')}`;
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
  order: SupportedTldsOrder
): string[] {
  if (fragment === null) {
    return tlds;
  }

  const matchingTlds = tlds.filter(tld => tld.startsWith(fragment));
  return order === 'relevance'
    ? matchingTlds.sort((a, b) =>
        a === fragment ? -1 : b === fragment ? 1 : 0
      )
    : matchingTlds;
}

async function quoteCandidates(
  client: Client,
  domains: string[]
): Promise<DomainCandidate[]> {
  if (domains.length === 0) {
    return [];
  }

  try {
    const response = await client.fetch<BulkDomainPriceResponse>(
      '/v1/registrar/domains/price',
      {
        method: 'POST',
        body: {
          domains,
        },
      }
    );
    const quotes = Array.isArray(response) ? response : response.results;
    const quotesByDomain = new Map(quotes.map(quote => [quote.domain, quote]));

    return domains.map(domain => {
      const quote = quotesByDomain.get(domain);
      if (!quote) {
        throw new Error(`Missing registrar quote for ${domain}.`);
      }
      const available = quote.purchasePrice !== null;
      return {
        domain: quote.domain,
        available,
        purchasePrice: quote.purchasePrice,
        renewalPrice: available ? quote.renewalPrice : null,
        years: quote.years,
      };
    });
  } catch (error) {
    if (!isAPIError(error) || error.code !== 'domain_too_short') {
      throw error;
    }

    if (domains.length === 1) {
      return [
        {
          domain: domains[0],
          available: false,
          purchasePrice: null,
          renewalPrice: null,
          years: null,
        },
      ];
    }

    const middle = Math.floor(domains.length / 2);
    return [
      ...(await quoteCandidates(client, domains.slice(0, middle))),
      ...(await quoteCandidates(client, domains.slice(middle))),
    ];
  }
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
