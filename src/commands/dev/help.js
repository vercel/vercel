import chalk from 'chalk';

import logo from '../../util/output/logo';

module.exports = () => `
  ${chalk.bold(`${logo} now`)} dev [options] [provider]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -n, --name                     Set the name of the deployment
    -d, --debug                    Debug mode [off]

  ${chalk.dim('Examples:')}

  ${chalk.gray(
    '–'
  )} Develop using native binaries (e.g. go/node/php/etc.) ${chalk.bold(
  '(default)'
)}

    ${chalk.cyan('$ now dev')}
    or
    ${chalk.cyan('$ now dev local')}

  ${chalk.gray('–')} Develop using Docker containers

    ${chalk.cyan('$ now dev docker')}

  ${chalk.gray('–')} Develop using a proxy to production ${chalk.bold(
  `${logo} now`
)}

    ${chalk.cyan('$ now dev production')}
`;
