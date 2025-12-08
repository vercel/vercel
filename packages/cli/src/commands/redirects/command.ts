import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List all redirects for the current project. These redirects apply to all deployments and environments. There may also be redirects defined in a deployment that are not listed here.',
  arguments: [],
  options: [
    {
      name: 'search',
      description: 'Search for redirects by source or destination',
      shorthand: 's',
      type: String,
      argument: 'QUERY',
      deprecated: false,
    },
    {
      name: 'page',
      description: 'Page number to display',
      shorthand: null,
      type: Number,
      argument: 'NUMBER',
      deprecated: false,
    },
    {
      name: 'per-page',
      description: 'Number of redirects per page (default: 50)',
      shorthand: null,
      type: Number,
      argument: 'NUMBER',
      deprecated: false,
    },
    {
      name: 'staged',
      description: 'List redirects from the staging version',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'version',
      description: 'List redirects from a specific version ID',
      shorthand: null,
      type: String,
      argument: 'VERSION_ID',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'List all redirects',
      value: `${packageName} redirects list`,
    },
    {
      name: 'Search for redirects',
      value: `${packageName} redirects list --search "/old-path"`,
    },
    {
      name: 'List redirects on page 2',
      value: `${packageName} redirects list --page 2`,
    },
    {
      name: 'List redirects with custom page size',
      value: `${packageName} redirects list --per-page 25`,
    },
  ],
} as const;

export const listVersionsSubcommand = {
  name: 'list-versions',
  aliases: ['ls-versions'],
  description: 'List all versions of redirects',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'List all redirect versions',
      value: `${packageName} redirects list-versions`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a new redirect',
  arguments: [
    {
      name: 'source',
      required: true,
    },
    {
      name: 'destination',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Add a new redirect',
      value: `${packageName} redirects add /old-path /new-path`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove a redirect',
  arguments: [
    {
      name: 'source',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when removing a redirect',
    },
  ],
  examples: [
    {
      name: 'Remove a redirect',
      value: `${packageName} redirects remove /old-path`,
    },
  ],
} as const;

export const promoteSubcommand = {
  name: 'promote',
  aliases: [],
  description: 'Promote a staged redirects version to production',
  arguments: [
    {
      name: 'version-id',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when promoting',
    },
  ],
  examples: [
    {
      name: 'Promote a redirect version',
      value: `${packageName} redirects promote <version-id>`,
    },
  ],
} as const;

export const restoreSubcommand = {
  name: 'restore',
  aliases: [],
  description: 'Restore a previous redirects version',
  arguments: [
    {
      name: 'version-id',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when restoring',
    },
  ],
  examples: [
    {
      name: 'Restore a redirects version',
      value: `${packageName} redirects restore <version-id>`,
    },
  ],
} as const;

export const redirectsCommand = {
  name: 'redirects',
  aliases: ['redirect'],
  description:
    'Manage redirects for a project. Redirects managed at the project level apply to all deployments and environments and take effect immediately after being created and promoted to production.',
  arguments: [],
  subcommands: [
    listSubcommand,
    listVersionsSubcommand,
    addSubcommand,
    removeSubcommand,
    promoteSubcommand,
    restoreSubcommand,
  ],
  options: [],
  examples: [],
} as const;
