// Packages
const chalk = require('chalk');

const DNS_VERIFICATION_ERROR = `Please make sure that your nameservers point to ${chalk.underline('zeit.world')}.
> Examples: (full list at ${chalk.underline('https://zeit.world')})
> ${chalk.gray('-')} ${chalk.underline('california.zeit.world')}    ${chalk.dim('173.255.215.107')}
> ${chalk.gray('-')} ${chalk.underline('newark.zeit.world')}        ${chalk.dim('173.255.231.87')}
> ${chalk.gray('-')} ${chalk.underline('london.zeit.world')}        ${chalk.dim('178.62.47.76')}
> ${chalk.gray('-')} ${chalk.underline('singapore.zeit.world')}     ${chalk.dim('119.81.97.170')}`;

const DOMAIN_VERIFICATION_ERROR = DNS_VERIFICATION_ERROR +
  `\n> Alternatively, ensure it resolves to ${chalk.underline('alias.zeit.co')} via ${chalk.dim('CNAME')} / ${chalk.dim('ALIAS')}.`;

module.exports = {
  DNS_VERIFICATION_ERROR,
  DOMAIN_VERIFICATION_ERROR
};
