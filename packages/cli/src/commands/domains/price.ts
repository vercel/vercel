import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { priceSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import getDomainPrice from '../../util/domains/get-domain-price';
import {
  InvalidDomain,
  isAPIError,
  UnsupportedTLD,
} from '../../util/errors-ts';
import chalk from 'chalk';

type DomainPriceQuote = {
  domain: string;
  purchasePrice: number | null;
  renewalPrice: number | null;
  transferPrice: number | null;
  years: number;
};

type BulkDomainPriceResponse =
  | DomainPriceQuote[]
  | {
      results: DomainPriceQuote[];
    };

export default async function price(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(priceSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const domains = parsedArgs.args;
  const hasMultipleInputDomains = domains.length > 1;
  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  if (domains.length === 0) {
    output.error('Missing domain name. Usage: `vercel domains price <domain>`');
    return 1;
  }

  try {
    const quotes: DomainPriceQuote[] =
      domains.length === 1
        ? await getSingleDomainQuote(client, domains[0])
        : await getBulkDomainQuotes(client, domains);

    if (formatResult.jsonOutput) {
      if (!hasMultipleInputDomains && quotes.length === 1) {
        client.stdout.write(`${JSON.stringify(quotes[0], null, 2)}\n`);
      } else {
        client.stdout.write(
          `${JSON.stringify({ results: quotes }, null, 2)}\n`
        );
      }
      return 0;
    }

    for (let i = 0; i < quotes.length; i++) {
      const quote = quotes[i];
      output.log(
        `${chalk.bold('Registrar pricing')} for ${chalk.cyan(quote.domain)}`
      );
      output.log(
        `  Purchase: ${quote.purchasePrice != null ? `$${quote.purchasePrice}` : 'n/a'}`
      );
      output.log(
        `  Renewal:  ${quote.renewalPrice != null ? `$${quote.renewalPrice}` : 'n/a'}`
      );
      output.log(
        `  Transfer: ${quote.transferPrice != null ? `$${quote.transferPrice}` : 'n/a'}`
      );
      output.log(`  Term:     ${quote.years} year(s)`);

      if (i < quotes.length - 1) {
        output.log('');
      }
    }
    return 0;
  } catch (error) {
    if (isAPIError(error)) {
      const msg = error.serverMessage || `API error (${error.status})`;
      if (formatResult.jsonOutput) {
        client.stdout.write(
          `${JSON.stringify(
            { error: error.code || 'api_error', message: msg },
            null,
            2
          )}\n`
        );
      } else {
        output.error(msg);
      }
      return 1;
    }

    printError(error);
    return 1;
  }
}

async function getSingleDomainQuote(
  client: Client,
  domain: string
): Promise<DomainPriceQuote[]> {
  const result = await getDomainPrice(client, domain);
  if (result instanceof UnsupportedTLD) {
    throw createApiLikeError(
      'unsupported_tld',
      `TLD not supported for price lookup: ${result.meta.domain}`
    );
  }
  if (result instanceof InvalidDomain) {
    throw createApiLikeError(
      'invalid_domain',
      `Invalid domain: ${result.meta.domain}`
    );
  }
  if (isAPIError(result)) {
    throw result;
  }

  return [
    {
      domain,
      purchasePrice: result.purchasePrice,
      renewalPrice: result.renewalPrice,
      transferPrice: result.transferPrice,
      years: result.years,
    },
  ];
}

async function getBulkDomainQuotes(
  client: Client,
  domains: string[]
): Promise<DomainPriceQuote[]> {
  const response = await client.fetch<BulkDomainPriceResponse>(
    '/v1/registrar/domains/price',
    {
      method: 'POST',
      body: {
        domains,
      },
    }
  );

  if (Array.isArray(response)) {
    return response;
  }

  return response.results;
}

function createApiLikeError(code: string, serverMessage: string) {
  const error = new Error(serverMessage) as Error & {
    code: string;
    status: number;
    serverMessage: string;
  };
  error.code = code;
  error.status = 400;
  error.serverMessage = serverMessage;
  return error;
}
