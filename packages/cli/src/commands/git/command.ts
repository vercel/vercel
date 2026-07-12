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
  description:
    'Manage your Git repository connection to the current Project. Also acts as a Git passthrough: `vc git push` runs Git and tracks Vercel deployments for linked projects; `vc git status` shows Git status plus latest Vercel deployments for the current branch.',
  arguments: [
    {
      name: 'git-args',
      required: false,
    },
  ],
  subcommands: [connectSubcommand, disconnectSubcommand],
  options: [
    {
      name: 'no-attach',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Do not poll or attach to deployments after `git push`; just run Git and exit',
    },
    {
      name: 'logs',
      shorthand: 'l',
      type: Boolean,
      deprecated: false,
      description:
        'Stream build logs for the current-directory project after `git push` (default: auto when cwd is inside a linked project rootDirectory)',
    },
    {
      name: 'no-logs',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Do not stream build logs even when attached to a deployment',
    },
  ],
  examples: [
    {
      name: 'Show Git status with Vercel deployments for this branch',
      value: `${packageName} git status`,
    },
    {
      name: 'Push and watch linked Vercel deployments',
      value: `${packageName} git push`,
    },
    {
      name: 'Push without attaching to deployments',
      value: `${packageName} git push --no-attach`,
    },
    {
      name: 'Run any Git command through Vercel CLI',
      value: `${packageName} git log --oneline -n 10`,
    },
  ],
} as const;
