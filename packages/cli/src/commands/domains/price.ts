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

  const domain = parsedArgs.args[0];
  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  if (!domain) {
    output.error('Missing domain name. Usage: `vercel domains price <domain>`');
    return 1;
  }

  const result = await getDomainPrice(client, domain);
  if (result instanceof UnsupportedTLD) {
    const msg = `TLD not supported for price lookup: ${result.meta.domain}`;
    if (formatResult.jsonOutput) {
      client.stdout.write(
        `${JSON.stringify({ error: 'unsupported_tld', message: msg }, null, 2)}\n`
      );
    } else {
      output.error(msg);
    }
    return 1;
  }
  if (result instanceof InvalidDomain) {
    const msg = `Invalid domain: ${result.meta.domain}`;
    if (formatResult.jsonOutput) {
      client.stdout.write(
        `${JSON.stringify({ error: 'invalid_domain', message: msg }, null, 2)}\n`
      );
    } else {
      output.error(msg);
    }
    return 1;
  }
  if (isAPIError(result)) {
    const msg = result.serverMessage || `API error (${result.status})`;
    if (formatResult.jsonOutput) {
      client.stdout.write(
        `${JSON.stringify({ error: result.code || 'api_error', message: msg }, null, 2)}\n`
      );
    } else {
      output.error(msg);
    }
    return 1;
  }

  const payload = {
    domain,
    purchasePrice: result.purchasePrice,
    renewalPrice: result.renewalPrice,
    transferPrice: result.transferPrice,
    years: result.years,
  };

  if (formatResult.jsonOutput) {
    client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return 0;
  }

  output.log(`${chalk.bold('Registrar pricing')} for ${chalk.cyan(domain)}`);
  output.log(
    `  Purchase: ${result.purchasePrice != null ? `$${result.purchasePrice}` : 'n/a'}`
  );
  output.log(
    `  Renewal:  ${result.renewalPrice != null ? `$${result.renewalPrice}` : 'n/a'}`
  );
  output.log(
    `  Transfer: ${result.transferPrice != null ? `$${result.transferPrice}` : 'n/a'}`
  );
  output.log(`  Term:     ${result.years} year(s)`);
  return 0;
}
