import chalk from 'chalk';

// Hardcoded to avoid importing pkg.ts which pulls in more dependencies
const packageName = 'vercel';
const logo = '▲';

const connexLine = process.env.FF_CONNEX_ENABLED
  ? '\n      connex               [cmd]       Manage Vercel Connect OAuth clients'
  : '';

export const help = () => `
  ${chalk.bold(`${logo} ${packageName}`)} [options] <command | path>

  ${chalk.dim('For deploy command help, run `vercel deploy --help`')}

  ${chalk.dim('Commands:')}

    ${chalk.dim('Basic')}

      deploy               [path]      Performs a deployment ${chalk.bold(
        '(default)'
      )}
      build                            Build the project locally into './vercel/output'
      cache                [cmd]       Manages cache for your current Project
      dev                              Start a local development server
      env                              Manages the Environment Variables for your current Project
      git                              Manage Git provider repository for your current Project
      help                 [cmd]       Displays complete help for [cmd]
      init                 [example]   Initialize an example project
      inspect              [id]        Displays information related to a deployment
      i | install          [name]      Install an integration from the Marketplace
      integration          [cmd]       Manages your Marketplace integrations
      ir | integration-resource [cmd]  Manages your Marketplace integration resources
      link                 [path]      Link local directory to a Vercel Project
      ls | list            [app]       Lists deployments
      login                [email]     Logs into your account or creates a new one
      logout                           Logs out of your account
      open                             Opens the current project in the Vercel Dashboard
      promote              [url|id]    Promote an existing deployment to current
      pull                 [path]      Pull your Project Settings from the cloud
      redeploy             [url|id]    Rebuild and deploy a previous deployment.
      rollback             [url|id]    Quickly revert back to a previous deployment
      switch               [scope]     Switches between different scopes

    ${chalk.dim('Advanced')}

      activity                         List user activity events
      agent                [init]      Generate AGENTS.md with Vercel best practices
      alerts                           List alerts for a project or team
      alias                [cmd]       Manages your domain aliases
      api                  [endpoint]  Make authenticated HTTP requests to the Vercel API [beta]
      bisect                           Use binary search to find the deployment that introduced a bug
      blob                 [cmd]       Manages your Blob stores and files
      buy                  [cmd]       Purchase Vercel products for your team
      certs                [cmd]       Manages your SSL certificates${connexLine}
      contract                         Show contract information for billing periods
      cron | crons         [cmd]       Manage cron jobs for a project [beta]
      curl                 [path]      cURL requests to your linked project's deployment [beta]
      deploy-hooks         [cmd]       Manage deploy hooks for Git-triggered builds
      dns                  [name]      Manages your DNS records
      domains              [name]      Manages your domain names
      httpstat             path        Visualize HTTP timing statistics for deployments
      logs                 [url]       Displays the logs for a deployment
      metrics              <metric>    Queries observability metrics for your project or team
      mcp                              Set up MCP agents and configuration
      microfrontends                   Manages your microfrontends
      projects                         Manages your Projects
      redirects            [cmd]       Manages redirects for your current Project
      rm | remove          [id]        Removes a deployment
      routes               [cmd]       Manages routing rules for your current Project
      rr | rolling-release [cmd]       Manage rolling releases for gradual traffic shifting
      skills               [query]     Discover agent skills relevant to your project
      target               [cmd]       Manage custom environments for your Project
      teams                            Manages your teams
      telemetry            [cmd]       Enable or disable telemetry collection
      upgrade                          Upgrade the Vercel CLI to the latest version
      usage                            Show billing usage for the current billing period
      webhooks             [cmd]       Manages webhooks [beta]
      whoami                           Shows the username of the currently logged in user

  ${chalk.dim('Global Options:')}

    -h, --help                     Output usage information
    -v, --version                  Output the version number
    --cwd                          Current working directory
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
      'FILE'
    )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
      'DIR'
    )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    --no-color                     No color mode [off]
    --non-interactive              Run without interactive prompts (default when agent detected)
    -S, --scope                    Set a custom scope
    -t ${chalk.underline('TOKEN')}, --token=${chalk.underline(
      'TOKEN'
    )}        Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Deploy the current directory

    ${chalk.cyan(`$ ${packageName}`)}

  ${chalk.gray('–')} Deploy a custom path

    ${chalk.cyan(`$ ${packageName} /usr/src/project`)}

  ${chalk.gray('–')} Deploy with Environment Variables

    ${chalk.cyan(`$ ${packageName} -e NODE_ENV=production`)}

  ${chalk.gray('–')} Show the usage information for the sub command ${chalk.dim(
    '`list`'
  )}

    ${chalk.cyan(`$ ${packageName} help list`)}
`;
