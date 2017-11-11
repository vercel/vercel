// Packages
const chalk = require('chalk')

const DNS_VERIFICATION_ERROR = `Please make sure that your nameservers point to ${chalk.underline(
  'zeit.world'
)}.
> Examples: (full list at ${chalk.underline('https://zeit.world')})
> ${chalk.gray('-')} ${chalk.underline('a.zeit.world')}    ${chalk.dim(
  '96.45.80.1'
)}
> ${chalk.gray('-')} ${chalk.underline('b.zeit.world')}    ${chalk.dim(
  '46.31.236.1'
)}
> ${chalk.gray('-')} ${chalk.underline('c.zeit.world')}    ${chalk.dim(
  '43.247.170.1'
)}`;

const DOMAIN_VERIFICATION_ERROR =
  DNS_VERIFICATION_ERROR +
  `\n> Alternatively, ensure it resolves to ${chalk.underline(
    'alias.zeit.co'
  )} via ${chalk.dim('CNAME')} / ${chalk.dim('ALIAS')}.`

module.exports = {
  DNS_VERIFICATION_ERROR,
  DOMAIN_VERIFICATION_ERROR
}
