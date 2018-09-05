// @flow
import chalk from 'chalk'
import table from 'text-table'

import strlen from './strlen'
import { Output } from './types'
import { DomainConfigurationError } from './errors'

export function handleDomainConfigurationError(output: Output, error: DomainConfigurationError) {
  output.error(`We couldn't verify the propagation of the DNS settings for ${chalk.underline(error.meta.domain)}`)
  if (error.meta.external) {
    output.print(`  The propagation may take a few minutes, but please verify your settings:\n\n`)
    output.print(dnsTable([
      error.meta.subdomain === null
        ? ['', 'ALIAS', 'alias.zeit.co']
        : [error.meta.subdomain, 'CNAME', 'alias.zeit.co']
    ]) + '\n\n');
    output.log(`Alternatively, you can issue a certificate solving DNS challenges manually after running:`);
    output.print(`  ${chalk.cyan(`now certs issue --challenge-only <cns>`)}\n`);
    output.print('  Read more: https://err.sh/now-cli/dns-configuration-error\n')
  } else {
    output.print(`  We configured them for you, but the propagation may take a few minutes. Please try again later.\n`)
    output.print('  Read more: https://err.sh/now-cli/dns-configuration-error\n')
  }
}

function dnsTable(rows, extraSpace = '') {
  return table([
    ['name', 'type', 'value'].map(v => chalk.gray(v)),
    ...rows
  ], {
    align: ['l', 'l', 'l'],
    hsep: ' '.repeat(8),
    stringLength: strlen
  }).replace(/^(.*)/gm, `${extraSpace}  $1`)
}
