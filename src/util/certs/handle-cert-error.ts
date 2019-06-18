import ms from 'ms';
import { parse } from 'psl';
import chalk from 'chalk';
import * as ERRORS from '../errors-ts';
import { Output } from '../output';
import dnsTable from '../format-dns-table';

export default function handleCertError(
  output: Output,
  error:
    | ERRORS.CertError
    | ERRORS.TooManyRequests
    | ERRORS.DomainNotFound
    | ERRORS.DomainValidationRunning
    | ERRORS.CertsDNSError
    | ERRORS.CertConfigurationError
): 1 | never {
  if (error instanceof ERRORS.TooManyRequests) {
    output.error(
      `Too many requests detected for ${error.meta.api} API. Try again in ${ms(
        error.meta.retryAfter * 1000,
        {
          long: true
        }
      )}.`
    );
    return 1;
  }

  if (error instanceof ERRORS.DomainNotFound) {
    output.error(error.message);
    return 1;
  }
  if (error instanceof ERRORS.DomainValidationRunning) {
    output.error(
      `There is a validation in course for ${error.meta.cns
        .map(cn => chalk.underline(cn))
        .join(', ')}. Please wait for it to complete.`
    );
    return 1;
  }
  if (error instanceof ERRORS.CertsDNSError) {
    output.error(
      `We could not solve the dns-01 challenge for cns ${error.meta.cns
        .map(cn => chalk.underline(cn))
        .join(', ')}.`
    );
    output.log(
      `The certificate provider could not resolve the required DNS record queries.`
    );
    output.print('  Read more: https://err.sh/now-cli/cant-solve-challenge\n');
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
              ? [parsed.subdomain, 'ALIAS', 'alias.zeit.co']
              : ['', 'ALIAS', 'alias.zeit.co'];
          })
        )}\n\n`
      );
      output.log(
        `Alternatively, you can issue a certificate solving DNS challenges manually after running:`
      );
      output.print(
        `  ${chalk.cyan(`now certs issue --challenge-only <cns>`)}\n`
      );
      output.print(
        '  Read more: https://err.sh/now-cli/dns-configuration-error\n'
      );
    } else {
      output.print(
        `  We configured them for you, but the propagation may take a few minutes. Please try again later.\n`
      );
      output.print(
        '  Read more: https://err.sh/now-cli/dns-configuration-error\n\n'
      );
    }
    return 1;
  }

  if (error instanceof ERRORS.CertError) {
    output.error(error.message);
    if (error.meta.helpUrl) {
      output.print(`  Read more: ${error.meta.helpUrl}\n`);
    }
    return 1;
  }

  return error;
}
