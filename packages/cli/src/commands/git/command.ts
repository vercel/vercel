import { packageName } from '../../util/pkg-name';
import { confirmOption, yesOption } from '../../util/arg-common';

export const connectSubcommand = {
  name: 'connect',
  aliases: [],
  description:
    'Connect your Vercel Project to your Git repository or provide the remote URL to your Git repository',
  arguments: [
    {
      name: 'git-url',
      required: false,
    },
  ],
  options: [yesOption, confirmOption],
  examples: [
    {
      name: 'Connect your Vercel Project to your Git repository defined in your local `.git` config',
      value: `${packageName} git connect`,
    },
    {
      name: 'Connect your Vercel Project to a Git repository using the remote URL',
      value: `${packageName} git connect https://github.com/user/repo.git`,
    },
  ],
} as const;

export const disconnectSubcommand = {
  name: 'disconnect',
  aliases: [],
  description: 'Disconnect the Git repository from your Vercel Project',
  arguments: [],
  options: [yesOption, confirmOption],
  examples: [
    {
      name: 'Disconnect the Git repository',
      value: `${packageName} git disconnect`,
    },
  ],
} as const;

export const gitCommand = {
  name: 'git',
  aliases: [],
  description: 'Manage your Git repository connection to the current Project',
  arguments: [],
  subcommands: [connectSubcommand, disconnectSubcommand],
  options: [],
  examples: [],
} as const;
