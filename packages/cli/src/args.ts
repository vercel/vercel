import pc from 'picocolors';
import { packageName, logo } from './util/pkg-name';

export const help = () => `
  ${pc.bold(`${logo} ${packageName}`)} [options] <command | path>

  ${pc.dim('For deploy command help, run `vercel deploy --help`')}

  ${pc.dim('Commands:')}

    ${pc.dim('Basic')}

      deploy               [path]      Performs a deployment ${pc.bold(
        '(default)'
      )}
      build                            Build the project locally into './vercel/output'
      dev                              Start a local development server
      env                              Manages the Environment Variables for your current Project
      git                              Manage Git provider repository for your current Project
      help                 [cmd]       Displays complete help for [cmd]
      init                 [example]   Initialize an example project
      inspect              [id]        Displays information related to a deployment
      i | install          [name]      Install an integration from the Marketplace
      integration          [cmd]       Manages your Marketplace integrations
      link                 [path]      Link local directory to a Vercel Project
      ls | list            [app]       Lists deployments
      login                [email]     Logs into your account or creates a new one
      logout                           Logs out of your account
      promote              [url|id]    Promote an existing deployment to current
      pull                 [path]      Pull your Project Settings from the cloud
      redeploy             [url|id]    Rebuild and deploy a previous deployment.
      rollback             [url|id]    Quickly revert back to a previous deployment
      switch               [scope]     Switches between different scopes

    ${pc.dim('Advanced')}

      alias                [cmd]       Manages your domain aliases
      bisect                           Use binary search to find the deployment that introduced a bug
      certs                [cmd]       Manages your SSL certificates
      dns                  [name]      Manages your DNS records
      domains              [name]      Manages your domain names
      logs                 [url]       Displays the logs for a deployment
      projects                         Manages your Projects
      rm | remove          [id]        Removes a deployment
      teams                            Manages your teams
      whoami                           Shows the username of the currently logged in user

  ${pc.dim('Global Options:')}

    -h, --help                     Output usage information
    -v, --version                  Output the version number
    --cwd                          Current working directory
    -A ${pc.bold.underline('FILE')}, --local-config=${pc.bold.underline(
      'FILE'
    )}   Path to the local ${'`vercel.json`'} file
    -Q ${pc.bold.underline('DIR')}, --global-config=${pc.bold.underline(
      'DIR'
    )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    --no-color                     No color mode [off]
    -S, --scope                    Set a custom scope
    -t ${pc.underline('TOKEN')}, --token=${pc.underline(
      'TOKEN'
    )}        Login token

  ${pc.dim('Examples:')}

  ${pc.gray('–')} Deploy the current directory

    ${pc.cyan(`$ ${packageName}`)}

  ${pc.gray('–')} Deploy a custom path

    ${pc.cyan(`$ ${packageName} /usr/src/project`)}

  ${pc.gray('–')} Deploy with Environment Variables

    ${pc.cyan(`$ ${packageName} -e NODE_ENV=production`)}

  ${pc.gray('–')} Show the usage information for the sub command ${pc.dim(
    '`list`'
  )}

    ${pc.cyan(`$ ${packageName} help list`)}
`;
