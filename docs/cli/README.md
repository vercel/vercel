# Vercel CLI Reference

Complete reference documentation for the Vercel Command Line Interface (CLI).

## Installation

```bash
npm i -g vercel
```

## Quick Start

```bash
vercel init     # Initialize an example project
cd <PROJECT>    # Change to project directory
vercel          # Deploy to Vercel
```

## Command Overview

### Core Commands

| Command                      | Description                                     |
| ---------------------------- | ----------------------------------------------- |
| [deploy](commands/deploy.md) | Deploy your project to Vercel (default command) |
| [build](commands/build.md)   | Build the project locally                       |
| [dev](commands/dev.md)       | Start the local development server              |
| [init](commands/init.md)     | Initialize example Vercel projects              |
| [pull](commands/pull.md)     | Pull environment variables and project settings |
| [link](commands/link.md)     | Link a local directory to a Vercel project      |
| [open](commands/open.md)     | Open the project in the Vercel Dashboard        |

### Authentication

| Command                      | Description                       |
| ---------------------------- | --------------------------------- |
| [login](commands/login.md)   | Sign in to your Vercel account    |
| [logout](commands/logout.md) | Sign out of your Vercel account   |
| [whoami](commands/whoami.md) | Show the currently logged in user |

### Deployment Management

| Command                                        | Description                              |
| ---------------------------------------------- | ---------------------------------------- |
| [list](commands/list.md)                       | List deployments for a project           |
| [inspect](commands/inspect.md)                 | Show information about a deployment      |
| [logs](commands/logs.md)                       | Display runtime logs for a deployment    |
| [redeploy](commands/redeploy.md)               | Rebuild and deploy a previous deployment |
| [remove](commands/remove.md)                   | Remove deployment(s)                     |
| [rollback](commands/rollback.md)               | Revert to a previous deployment          |
| [promote](commands/promote.md)                 | Promote a deployment to production       |
| [rolling-release](commands/rolling-release.md) | Manage rolling releases                  |

### Project Management

| Command                        | Description                          |
| ------------------------------ | ------------------------------------ |
| [project](commands/project.md) | Manage Vercel projects               |
| [target](commands/target.md)   | Manage custom environments (targets) |

### Environment Variables

| Command                | Description                                |
| ---------------------- | ------------------------------------------ |
| [env](commands/env.md) | Manage environment variables for a project |

### Domains & DNS

| Command                        | Description               |
| ------------------------------ | ------------------------- |
| [domains](commands/domains.md) | Manage domain names       |
| [dns](commands/dns.md)         | Manage DNS records        |
| [alias](commands/alias.md)     | Manage deployment aliases |
| [certs](commands/certs.md)     | Manage SSL certificates   |

### Teams

| Command                    | Description                            |
| -------------------------- | -------------------------------------- |
| [teams](commands/teams.md) | Manage teams under your Vercel account |

### Integrations

| Command                                                  | Description                     |
| -------------------------------------------------------- | ------------------------------- |
| [integration](commands/integration.md)                   | Manage marketplace integrations |
| [integration-resource](commands/integration-resource.md) | Manage integration resources    |
| [install](commands/install.md)                           | Install an integration (alias)  |

### Storage

| Command                  | Description                       |
| ------------------------ | --------------------------------- |
| [blob](commands/blob.md) | Interact with Vercel Blob storage |

### Cache

| Command                    | Description                |
| -------------------------- | -------------------------- |
| [cache](commands/cache.md) | Manage cache for a project |

### Git Integration

| Command                | Description                      |
| ---------------------- | -------------------------------- |
| [git](commands/git.md) | Manage Git repository connection |

### Redirects

| Command                            | Description                    |
| ---------------------------------- | ------------------------------ |
| [redirects](commands/redirects.md) | Manage project-level redirects |

### Debugging & Testing

| Command                          | Description                           |
| -------------------------------- | ------------------------------------- |
| [bisect](commands/bisect.md)     | Binary search for broken deployments  |
| [curl](commands/curl.md)         | Execute curl with auto deployment URL |
| [httpstat](commands/httpstat.md) | HTTP timing statistics visualization  |

### Advanced Features

| Command                                      | Description                          |
| -------------------------------------------- | ------------------------------------ |
| [microfrontends](commands/microfrontends.md) | Manage microfrontends configuration  |
| [mcp](commands/mcp.md)                       | Set up MCP agents for AI integration |

### CLI Management

| Command                            | Description                     |
| ---------------------------------- | ------------------------------- |
| [telemetry](commands/telemetry.md) | Manage CLI telemetry collection |
| [upgrade](commands/upgrade.md)     | Upgrade the Vercel CLI          |

## Global Options

These options are available for all commands:

| Option                  | Shorthand | Description                                            |
| ----------------------- | --------- | ------------------------------------------------------ |
| `--help`                | `-h`      | Output usage information                               |
| `--version`             | `-v`      | Output the version number                              |
| `--cwd <DIR>`           |           | Set current working directory for a single command run |
| `--local-config <FILE>` | `-A`      | Path to the local `vercel.json` file                   |
| `--global-config <DIR>` | `-Q`      | Path to the global `.vercel` directory                 |
| `--debug`               | `-d`      | Enable debug mode (default: off)                       |
| `--no-color`            |           | Disable colored output                                 |
| `--scope <SCOPE>`       | `-S`      | Set a custom scope (team or user)                      |
| `--token <TOKEN>`       | `-t`      | Authentication token                                   |
| `--team <TEAM>`         | `-T`      | Team slug or ID                                        |
| `--api <URL>`           |           | Custom API endpoint URL                                |

### Global Options Details

#### `--cwd <DIR>`

Sets the current working directory for a single run of a command. Useful when running commands from a different directory than your project.

```bash
vercel deploy --cwd /path/to/project
vercel env pull --cwd ./my-app
```

#### `--local-config <FILE>` / `-A`

Specify a custom path to the local `vercel.json` configuration file instead of the default location in the project root.

```bash
vercel deploy --local-config ./config/vercel.json
vercel deploy -A ./custom-vercel.json
```

#### `--global-config <DIR>` / `-Q`

Specify a custom path to the global `.vercel` directory, which stores authentication and global settings.

```bash
vercel login --global-config ~/.vercel-custom
vercel whoami -Q /custom/config/path
```

#### `--debug` / `-d`

Enable debug mode to see detailed information about API calls, file operations, and internal processes. Useful for troubleshooting.

```bash
vercel deploy --debug
vercel dev -d
```

#### `--no-color`

Disable colored output. Useful for CI environments or when piping output to files.

```bash
vercel list --no-color > deployments.txt
```

#### `--scope <SCOPE>` / `-S`

Set a custom scope (team or username) for the command. Overrides the currently selected team.

```bash
vercel deploy --scope my-team
vercel list -S personal-account
```

#### `--token <TOKEN>` / `-t`

Provide an authentication token directly instead of using stored credentials. Essential for CI/CD environments.

```bash
vercel deploy --token $VERCEL_TOKEN
vercel list -t $MY_TOKEN
```

#### `--team <TEAM>` / `-T`

Specify the team by slug or ID. Similar to `--scope` but specifically for teams.

```bash
vercel deploy --team team_abc123
vercel list -T my-company
```

#### `--api <URL>`

Use a custom API endpoint instead of the default Vercel API. Primarily used for testing or enterprise configurations.

```bash
vercel deploy --api https://api.custom-vercel.com
```

## Environment Variables

The CLI respects these environment variables:

| Variable                          | Description                                     |
| --------------------------------- | ----------------------------------------------- |
| `VERCEL_TOKEN`                    | Authentication token (alternative to `--token`) |
| `VERCEL_ORG_ID`                   | Organization/Team ID                            |
| `VERCEL_PROJECT_ID`               | Project ID                                      |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Protection bypass secret for automated requests |
| `FORCE_COLOR`                     | Force colored output (set to `1` or `0`)        |
| `NO_COLOR`                        | Disable colored output (any value)              |

## Exit Codes

| Code | Description                        |
| ---- | ---------------------------------- |
| 0    | Success                            |
| 1    | General error                      |
| 2    | Invalid arguments or configuration |

## See Also

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Dashboard](https://vercel.com/dashboard)
- [GitHub Repository](https://github.com/vercel/vercel)
