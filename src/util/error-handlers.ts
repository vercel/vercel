import { DomainConfigurationError } from './errors-ts';
import { Output } from './output';
import chalk from 'chalk';
import dnsTable from './format-dns-table';

export function handleDomainConfigurationError(
  output: Output,
  error: DomainConfigurationError
) {
  output.error(
    `We couldn't verify the propagation of the DNS settings for ${chalk.underline(
      error.meta.domain
    )}`
  );
  if (error.meta.external) {
    output.print(
      `  The propagation may take a few minutes, but please verify your settings:\n\n`
    );
    output.print(
      `${dnsTable([
        error.meta.subdomain === null
          ? ['', 'ALIAS', 'alias.zeit.co']
          : [error.meta.subdomain, 'CNAME', 'alias.zeit.co']
      ])}\n\n`
    );
    output.log(
      `Alternatively, you can issue a certificate solving DNS challenges manually after running:`
    );
    output.print(`  ${chalk.cyan(`now certs issue --challenge-only <cns>`)}\n`);
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
}
