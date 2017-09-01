const cmd = require('./util/output/cmd')
const li = require('./util/output/list-item')
const link = require('./util/output/link')
const { gray, bold } = require('chalk')

// prettier-disable
const getWelcome = (currentProvider, providers) =>
  `
  Welcome to ${bold('Now')}!

  Our tool makes serverless deployment universal and instant,
  with just one command: ${cmd('now')}.

  To setup deployments with ${link('https://now.sh')} run:

    ${cmd('now login')}

  The following providers are also supported

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

  To set up AWS, for example, run ${cmd('now aws login')}.
  Many can be configured simultaneously!

  Hope you enjoy Now! Check out these other resources:

    ${li(`Run ${cmd('now help')} for more info and examples`)}
    ${li(link('https://github.com/zeit/now-cli'))}
`

module.exports = getWelcome
