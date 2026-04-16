import { packageName } from '../../util/pkg-name';
import { formatOption, yesOption } from '../../util/arg-common';

const projectOption = {
  name: 'project',
  shorthand: 'p',
  type: String,
  argument: 'PROJECT',
  description: 'Project name or ID (defaults to the linked project)',
  deprecated: false,
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List deploy hooks for a project',
  arguments: [],
  options: [formatOption, projectOption],
  examples: [
    {
      name: 'List deploy hooks as JSON',
      value: `${packageName} deploy-hooks ls --format json`,
    },
  ],
} as const;

export const createSubcommand = {
  name: 'create',
  aliases: ['add'],
  description: 'Create a deploy hook for a Git branch',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [
    {
      name: 'ref',
      shorthand: 'r',
      type: String,
      argument: 'BRANCH',
      deprecated: false,
      description: 'Git branch ref to deploy when the hook URL is triggered',
    },
    projectOption,
  ],
  examples: [
    {
      name: 'Create a hook that deploys `main`',
      value: `${packageName} deploy-hooks create cms-rebuild --ref main`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description: 'Remove a deploy hook by id',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when removing a deploy hook',
    },
  ],
  examples: [],
} as const;

export const deployHooksCommand = {
  name: 'deploy-hooks',
  aliases: ['deploy-hook'],
  description: 'Manage deploy hooks for Git-triggered builds',
  arguments: [],
  subcommands: [listSubcommand, createSubcommand, removeSubcommand],
  options: [],
  examples: [],
} as const;
