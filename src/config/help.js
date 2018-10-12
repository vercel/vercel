const { bold } = require('chalk');
const li = require('../util/output/list-item');
const link = require('../util/output/link');

// prettier-disable
const help = () =>
  console.log(
    `
  ${bold('now config [subcommand]')}: manage global configuration.

  Subcommands:

    ${li('set <name> <value>')}
    ${li('help')}

  For more information: ${link('https://github.com/zeit/now-cli')}.
`
  );

module.exports = help;
