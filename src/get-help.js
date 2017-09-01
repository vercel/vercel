const cmd = require('./util/output/cmd')
const li = require('./util/output/list-item')
const link = require('./util/output/link')
const { gray, bold } = require('chalk')

// prettier-disable
const getHelp = (currentProvider, providers) =>
  `
  ${bold('Now')}: universal serverless deployments.

  To deploy, run in any directory of your choosing:

    ${cmd('now')}

  The deployment backend provider is fully configurable.
  The following are supported:

    ${Object.keys(providers)
      .map(name =>
        li(
          `${bold(name)}\t ${providers[name]
            .title}\t\t\t\t\t${currentProvider === name
            ? gray('(default)')
            : ' '}`
        )
      )
      .join('\n    ')}

  For example, to setup AWS Lambda functions run:

    ${cmd('now aws login')}

  Some useful subcommands:

    ${li(cmd('now ls'))}
    ${li(cmd('now rm'))}
    ${li(cmd('now alias'))}

  To read more in-depth documentation, run:

    ${cmd('now [provider] [subcommand] help')}

  For more information: ${link('https://github.com/zeit/now')}.
`

module.exports = getHelp
