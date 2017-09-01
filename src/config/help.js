const { bold } = require('chalk')
const cmd = require('../util/output/cmd')
const li = require('../util/output/list-item')
const link = require('../util/output/link')

// prettier-disable
const help = () =>
  console.log(
    `
  ${bold('now config [subcommand]')}: manage global configuration.

  Subcommands:

    ${li('set <name> <value>')}
    ${li('help')}

  For example, to set default provider to AWS Lambda, run:

    ${cmd('now config set defaultProvider aws')}

  For more information: ${link('https://github.com/zeit/now')}.
`
  )

module.exports = help
