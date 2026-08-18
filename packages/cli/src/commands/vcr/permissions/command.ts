import {
  formatOption,
  limitOption,
  projectOption,
  yesOption,
} from '../../../util/arg-common';
import { packageName } from '../../../util/pkg-name';

/**
 * Action aliases for the `vcr permissions <repository> <action>` group. Kept
 * here (instead of `permissions/index.ts`) so the top-level `vcr` dispatcher
 * can reuse it for `--help` routing without eagerly importing the router.
 */
export const PERMISSIONS_ACTIONS: Record<
  'ls' | 'add' | 'rm' | 'clear',
  string[]
> = {
  ls: ['ls', 'list'],
  add: ['add'],
  rm: ['rm', 'remove'],
  clear: ['clear'],
};

const projectScopeOption = {
  ...projectOption,
  shorthand: 'p',
  description: 'Project name or ID (defaults to the linked project).',
} as const;

const cursorOption = {
  name: 'cursor',
  shorthand: 'c',
  type: String,
  deprecated: false,
  description: 'Cursor from a previous page to continue listing from',
  argument: 'STRING',
} as const;

export const permissionsLsSubcommand = {
  name: 'ls',
  aliases: ['list'],
  description: 'List teams with access to a repository',
  arguments: [],
  options: [projectScopeOption, limitOption, cursorOption, formatOption],
  examples: [
    {
      name: 'List teams with access to a repository',
      value: `${packageName} vcr permissions my-app ls`,
    },
    {
      name: 'List teams with access as JSON',
      value: `${packageName} vcr permissions my-app ls --format json`,
    },
  ],
} as const;

export const permissionsAddSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Give one or more teams access to pull images from a repository',
  arguments: [
    {
      name: 'team',
      required: true,
      multiple: true,
    },
  ],
  options: [projectScopeOption, formatOption],
  examples: [
    {
      name: 'Share a repository with a team by id',
      value: `${packageName} vcr permissions my-app add team_1a2b3c4d`,
    },
    {
      name: 'Share a repository with a team by slug',
      value: `${packageName} vcr permissions my-app add my-team`,
    },
    {
      name: 'Share a repository with multiple teams',
      value: `${packageName} vcr permissions my-app add team_1a2b3c4d,other-team`,
    },
  ],
} as const;

export const permissionsRmSubcommand = {
  name: 'rm',
  aliases: ['remove'],
  description: "Remove one or more teams' access to a repository",
  arguments: [
    {
      name: 'team',
      required: true,
      multiple: true,
    },
  ],
  options: [projectScopeOption, formatOption],
  examples: [
    {
      name: "Remove a team's access by id",
      value: `${packageName} vcr permissions my-app rm team_1a2b3c4d`,
    },
    {
      name: "Remove multiple teams' access",
      value: `${packageName} vcr permissions my-app rm team_1a2b3c4d,other-team`,
    },
  ],
} as const;

export const permissionsClearSubcommand = {
  name: 'clear',
  aliases: [],
  description: 'Remove access to a repository for every team',
  arguments: [],
  options: [projectScopeOption, yesOption, formatOption],
  examples: [
    {
      name: 'Clear all repository permissions',
      value: `${packageName} vcr permissions my-app clear`,
    },
    {
      name: 'Clear all repository permissions without the confirmation prompt',
      value: `${packageName} vcr permissions my-app clear --yes`,
    },
  ],
} as const;

/**
 * Umbrella command used only for help output of the nested `vcr permissions`
 * group. Unlike `vcr image`/`vcr tag`, the group uses
 * `vcr permissions <repository> <action>` ordering, so the repository is an
 * argument of the umbrella command itself. Routing happens in
 * `permissions/index.ts`.
 */
export const permissionsAggregateCommand = {
  name: 'permissions',
  aliases: ['permission'],
  description:
    'Manage which teams can pull images from a container registry repository',
  arguments: [
    {
      name: 'repository',
      required: true,
    },
  ],
  subcommands: [
    permissionsLsSubcommand,
    permissionsAddSubcommand,
    permissionsRmSubcommand,
    permissionsClearSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List teams with access to a repository',
      value: `${packageName} vcr permissions my-app ls`,
    },
    {
      name: 'Share a repository with a team',
      value: `${packageName} vcr permissions my-app add team_1a2b3c4d`,
    },
    {
      name: "Remove a team's access to a repository",
      value: `${packageName} vcr permissions my-app rm team_1a2b3c4d`,
    },
    {
      name: 'Clear all repository permissions',
      value: `${packageName} vcr permissions my-app clear`,
    },
  ],
} as const;
