import chalk from 'chalk';
import logo from '../../util/output/logo';

export const help = () => `
  ${chalk.bold(`${logo} now`)} [options] <command | path>

  ${chalk.dim('Commands:')}

    ${chalk.dim('Basic')}

      deploy               [path]      Performs a deployment ${chalk.bold(
        '(default)'
      )}
      dev                              Start a local development server
      init                 [example]   Initialize an example project
      ls | list            [app]       Lists deployments
      inspect              [id]        Displays information related to a deployment
      login                [email]     Logs into your account or creates a new one
      logout                           Logs out of your account
      switch               [scope]     Switches between teams and your personal account
      help                 [cmd]       Displays complete help for [cmd]

    ${chalk.dim('Advanced')}

      rm | remove          [id]        Removes a deployment
      domains              [name]      Manages your domain names
      dns                  [name]      Manages your DNS records
      certs                [cmd]       Manages your SSL certificates
      secrets              [name]      Manages your secret environment variables
      logs                 [url]       Displays the logs for a deployment
      teams                            Manages your teams
      whoami                           Shows the username of the currently logged in user

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -v, --version                  Output the version number
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
  'FILE'
)}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
  'DIR'
)}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -f, --force                    Force a new deployment even if nothing has changed
    -t ${chalk.underline('TOKEN')}, --token=${chalk.underline(
  'TOKEN'
)}        Login token
    -p, --public                   Deployment is public (${chalk.dim(
      '`/_src`'
    )} is exposed)
    -e, --env                      Include an env var during run time (e.g.: ${chalk.dim(
      '`-e KEY=value`'
    )}). Can appear many times.
    -b, --build-env                Similar to ${chalk.dim(
      '`--env`'
    )} but for build time only.
    -m, --meta                     Add metadata for the deployment (e.g.: ${chalk.dim(
      '`-m KEY=value`'
    )}). Can appear many times.
    -C, --no-clipboard             Do not attempt to copy URL to clipboard
    -S, --scope                    Set a custom scope
    --regions                      Set default regions to enable the deployment on
    --prod                         Create a production deployment
    -c, --confirm                  Confirm default options and skip questions

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Deploy the current directory

    ${chalk.cyan('$ now')}

  ${chalk.gray('–')} Deploy a custom path

    ${chalk.cyan('$ now /usr/src/project')}

  ${chalk.gray('–')} Deploy with environment variables

    ${chalk.cyan('$ now -e NODE_ENV=production -e SECRET=@mysql-secret')}

  ${chalk.gray('–')} Show the usage information for the sub command ${chalk.dim(
  '`list`'
)}

    ${chalk.cyan('$ now help list')}

`;

export const args = {
  '--force': Boolean,
  '--public': Boolean,
  '--no-clipboard': Boolean,
  '--env': [String],
  '--build-env': [String],
  '--meta': [String],
  // This is not an array in favor of matching
  // the config property name.
  '--regions': String,
  '--prod': Boolean,
  '--confirm': Boolean,
  '-f': '--force',
  '-p': '--public',
  '-e': '--env',
  '-b': '--build-env',
  '-C': '--no-clipboard',
  '-m': '--meta',
  '-c': '--confirm',

  // deprecated
  '--name': String,
  '-n': '--name',
  '--target': String,
};
