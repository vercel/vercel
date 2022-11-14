import ms from 'ms';
import { parse } from 'psl';
import chalk from 'chalk';
import * as ERRORS from '../errors-ts';
import { Output } from '../output';
import dnsTable from '../format-dns-table';
import { getCommandName } from '../pkg-name';

export default function handleCertError<T>(
  output: Output,
  error:
    | ERRORS.CertError
    | ERRORS.TooManyRequests
    | ERRORS.DomainNotFound
    | ERRORS.CertConfigurationError
    | T
): 1 | T {
  if (error instanceof ERRORS.TooManyRequests) {
    output.error(
      `Too many requests detected for ${error.meta.api} API. Try again in ${ms(
        error.meta.retryAfter * 1000,
        {
          long: true,
        }
      )}.`
    );
    return 1;
  }

  if (error instanceof ERRORS.CertError) {
    output.error(error.message);
    if (error.meta.helpUrl) {
      output.print(`  Read more: ${error.meta.helpUrl}\n`);
    }
    return 1;
  }

  if (error instanceof ERRORS.DomainNotFound) {
    output.error(error.message);
    return 1;
  }

  if (error instanceof ERRORS.CertConfigurationError) {
    const { external, cns } = error.meta;
    output.error(
      `We couldn't verify the propagation of the DNS settings for ${error.meta.cns
        .map(cn => chalk.underline(cn))
        .join(', ')}`
    );
    if (external) {
      output.print(
        `  The propagation may take a few minutes, but please verify your settings:\n\n`
      );
      output.print(
        `${dnsTable(
          cns.map(cn => {
            const parsed = parse(cn);
            return !parsed.error && parsed.subdomain
              ? [parsed.subdomain, 'ALIAS', 'alias.vercel.com']
              : ['', 'ALIAS', 'alias.vercel.com'];
          })
        )}\n\n`
      );
      output.log(
        `Alternatively, you can issue a certificate solving DNS challenges manually after running:`
      );
      output.print(
        `  ${getCommandName(`certs issue --challenge-only <cns>`)}\n`
      );
      output.print(
        '  Read more: https://err.sh/vercel/dns-configuration-error\n'
      );
    } else {
      output.print(
        `  We configured them for you, but the propagation may take a few minutes. Please try again later.\n`
      );
      output.print(
        '  Read more: https://err.sh/vercel/dns-configuration-error\n\n'
      );
    }
    return 1;
  }

  return error;
}
