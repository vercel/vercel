import chalk from 'chalk';
import logo from '../../util/output/logo';
import code from '../../util/output/code';
import note from '../../util/output/note';

export const latestHelp = () => `
  ${chalk.bold(`${logo} now`)} [options] <command | path>

  ${chalk.dim('Commands:')}

    ${chalk.dim('Basic')}

      deploy               [path]      Performs a deployment ${chalk.bold(
        '(default)'
      )}
      dev                              Start a local development server
      env                              Manages the Environment Variables for your current Project
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
      secrets              [name]      Manages your global Secrets, for use in Environment Variables
      logs                 [url]       Displays the logs for a deployment
      teams                            Manages your teams
      whoami                           Shows the username of the currently logged in user

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -v, --version                  Output the version number
    -V, --platform-version         Set the platform version to deploy to
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
  'FILE'
)}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
  'DIR'
)}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    -f, --force                    Force a new deployment even if nothing has changed
    --with-cache                   Retain build cache when using "--force"
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

  ${note(
    `To view the usage information for Now 1.0, run ${code(
      'now help deploy-v1'
    )}`
  )}

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Deploy the current directory

    ${chalk.cyan('$ now')}

  ${chalk.gray('–')} Deploy a custom path

    ${chalk.cyan('$ now /usr/src/project')}

  ${chalk.gray('–')} Deploy with Environment Variables

    ${chalk.cyan('$ now -e NODE_ENV=production -e SECRET=@mysql-secret')}

  ${chalk.gray('–')} Show the usage information for the sub command ${chalk.dim(
  '`list`'
)}

    ${chalk.cyan('$ now help list')}

`;

export const latestArgs = {
  '--force': Boolean,
  '--with-cache': Boolean,
  '--public': Boolean,
  '--no-clipboard': Boolean,
  '--env': [String],
  '--build-env': [String],
  '--meta': [String],
  '--no-scale': Boolean,
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

export const legacyArgsMri = {
  string: [
    'name',
    'build-env',
    'alias',
    'meta',
    'session-affinity',
    'regions',
    'dotenv',
    'target',
  ],
  boolean: [
    'help',
    'version',
    'debug',
    'force',
    'links',
    'C',
    'clipboard',
    'forward-npm',
    'docker',
    'npm',
    'static',
    'public',
    'no-scale',
    'no-verify',
    'dotenv',
    'prod',
  ],
  default: {
    C: false,
    clipboard: true,
  },
  alias: {
    env: 'e',
    meta: 'm',
    'build-env': 'b',
    dotenv: 'E',
    help: 'h',
    debug: 'd',
    version: 'v',
    force: 'f',
    links: 'l',
    public: 'p',
    'forward-npm': 'N',
    'session-affinity': 'S',
    name: 'n',
    project: 'P',
    alias: 'a',
  },
};

// The following arg parsing is simply to make it compatible
// with the index. Let's not migrate it to the new args parsing, as
// we are gonna delete this file soon anyways.
const argList = {};

for (const item of legacyArgsMri.string) {
  argList[`--${item}`] = String;
}

for (const item of legacyArgsMri.boolean) {
  argList[`--${item}`] = Boolean;
}

for (const item of Object.keys(legacyArgsMri.alias)) {
  argList[`-${legacyArgsMri.alias[item]}`] = `--${item}`;
}

export const legacyArgs = argList;

export const legacyHelp = () => `
  ${chalk.bold(`${logo} now`)} [options] <command | path>

  ${chalk.dim('Commands:')}

    ${chalk.dim('Cloud')}

      deploy               [path]      Performs a deployment ${chalk.bold(
        '(default)'
      )}
      ls | list            [app]       Lists deployments
      rm | remove          [id]        Removes a deployment
      ln | alias           [id] [url]  Configures aliases for deployments
      inspect              [id]        Displays information related to a deployment
      domains              [name]      Manages your domain names
      certs                [cmd]       Manages your SSL certificates
      secrets              [name]      Manages your secret environment variables
      dns                  [name]      Manages your DNS records
      logs                 [url]       Displays the logs for a deployment
      scale                [args]      Scales the instance count of a deployment
      init                 [example]   Initialize an example project
      help                 [cmd]       Displays complete help for [cmd]

    ${chalk.dim('Administrative')}

      billing | cc         [cmd]       Manages your credit cards and billing methods
      upgrade | downgrade  [plan]      Upgrades or downgrades your plan
      teams                            Manages your teams
      switch               [scope]     Switches between teams and your account
      login                [email]     Logs into your account or creates a new one
      logout                           Logs out of your account
      whoami                           Shows the username of the currently logged in user

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -v, --version                  Output the version number
    -V, --platform-version         Set the platform version to deploy to
    -n, --name                     Set the project name of the deployment
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
  'FILE'
)}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
  'DIR'
)}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    -f, --force                    Force a new deployment even if nothing has changed
    -t ${chalk.underline('TOKEN')}, --token=${chalk.underline(
  'TOKEN'
)}        Login token
    -l, --links                    Copy symlinks without resolving their target
    -p, --public                   Deployment is public (${chalk.dim(
      '`/_src`'
    )} is exposed) [on for oss, off for premium]
    -e, --env                      Include an env var during run time (e.g.: ${chalk.dim(
      '`-e KEY=value`'
    )}). Can appear many times.
    -b, --build-env                Similar to ${chalk.dim(
      '`--env`'
    )} but for build time only.
    -m, --meta                     Add metadata for the deployment (e.g.: ${chalk.dim(
      '`-m KEY=value`'
    )}). Can appear many times.
    -E ${chalk.underline('FILE')}, --dotenv=${chalk.underline(
  'FILE'
)}         Include env vars from .env file. Defaults to '.env'
    -C, --no-clipboard             Do not attempt to copy URL to clipboard
    -N, --forward-npm              Forward login information to install private npm modules
    --session-affinity             Session affinity, \`ip\` or \`random\` (default) to control session affinity
    -S, --scope                    Set a custom scope
    --regions                      Set default regions or DCs to enable the deployment on
    --no-scale                     Skip scaling rules deploying with the default presets
    --no-verify                    Skip step of waiting until instance count meets given constraints

  ${chalk.dim(`Enforceable Types (by default, it's detected automatically):`)}

    --npm                          Node.js application
    --docker                       Docker container
    --static                       Static file hosting

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Deploy the current directory

    ${chalk.cyan('$ now')}

  ${chalk.gray('–')} Deploy a custom path

    ${chalk.cyan('$ now /usr/src/project')}

  ${chalk.gray('–')} Deploy a GitHub repository

    ${chalk.cyan('$ now user/repo#ref')}

  ${chalk.gray('–')} Deploy with environment variables

    ${chalk.cyan('$ now -e NODE_ENV=production -e SECRET=@mysql-secret')}

  ${chalk.gray('–')} Show the usage information for the sub command ${chalk.dim(
  '`list`'
)}

    ${chalk.cyan('$ now help list')}

`;
