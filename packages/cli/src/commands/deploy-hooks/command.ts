import { packageName } from '../../util/pkg-name';
import {
  formatOption,
  gitBranchOption,
  jsonOption,
  projectOption as sharedProjectOption,
  yesOption,
} from '../../util/arg-common';

const projectOption = {
  ...sharedProjectOption,
  shorthand: 'p',
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  default: true,
  description:
    'List deploy hooks for a project (anyone with a hook URL can trigger a deployment)',
  arguments: [],
  options: [formatOption, jsonOption, projectOption],
  examples: [
    {
      name: 'List deploy hooks as JSON',
      value: `${packageName} deploy-hooks list --json`,
    },
  ],
} as const;

export const createSubcommand = {
  name: 'create',
  aliases: ['add'],
  description:
    'Create a deploy hook for a Git branch (anyone with the URL can trigger a deployment)',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [
    {
      ...gitBranchOption,
      description: 'Git branch to deploy when the hook URL is triggered',
    },
    // Hidden: `--ref` and `-r` are the old names of `--git-branch`.
    {
      name: 'ref',
      shorthand: 'r',
      type: String,
      argument: 'BRANCH',
      deprecated: true,
      description: 'Deprecated alias for `--git-branch`',
    },
    projectOption,
  ],
  examples: [
    {
      name: 'Create a hook that deploys `main`',
      value: `${packageName} deploy-hooks create cms-rebuild --git-branch main`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'delete',
  aliases: ['rm', 'del', 'remove'],
  description: 'Delete a deploy hook by id',
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
      description: 'Skip the confirmation prompt when deleting a deploy hook',
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
