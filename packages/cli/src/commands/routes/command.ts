import { packageName } from '../../util/pkg-name';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List all routing rules for the current project. These routes apply to all deployments and environments.',
  arguments: [],
  options: [
    {
      name: 'search',
      description: 'Search by name, description, source, or destination',
      shorthand: 's',
      type: String,
      argument: 'QUERY',
      deprecated: false,
    },
    {
      name: 'filter',
      description:
        'Filter by type: header, rewrite, redirect, terminate, transform',
      shorthand: 'f',
      type: String,
      argument: 'TYPE',
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
      description: 'Number of routes per page (default: 50)',
      shorthand: null,
      type: Number,
      argument: 'NUMBER',
      deprecated: false,
    },
    {
      name: 'staging',
      description: 'List routes from the staging version',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'version',
      description: 'List routes from a specific version ID',
      shorthand: null,
      type: String,
      argument: 'VERSION_ID',
      deprecated: false,
    },
    {
      name: 'diff',
      description: 'Show diff between staging and production',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'expand',
      description: 'Show expanded details for each route',
      shorthand: 'e',
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'List all routes',
      value: `${packageName} routes list`,
    },
    {
      name: 'Search for routes',
      value: `${packageName} routes list --search "api"`,
    },
    {
      name: 'Filter by type',
      value: `${packageName} routes list --filter rewrite`,
    },
    {
      name: 'Show staging changes',
      value: `${packageName} routes list --staging --diff`,
    },
    {
      name: 'Show expanded details',
      value: `${packageName} routes list --expand`,
    },
  ],
} as const;

export const listVersionsSubcommand = {
  name: 'list-versions',
  aliases: ['ls-versions'],
  description: 'List all versions of routing rules',
  arguments: [],
  options: [
    {
      name: 'count',
      description: 'Number of versions to fetch (default: 20, max: 100)',
      shorthand: null,
      type: Number,
      argument: 'NUMBER',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'List route versions',
      value: `${packageName} routes list-versions`,
    },
    {
      name: 'List more versions',
      value: `${packageName} routes list-versions --count 50`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show detailed information about a specific route',
  arguments: [
    {
      name: 'name-or-id',
      required: true,
    },
  ],
  options: [
    {
      name: 'staging',
      description: 'Inspect route from the staging version',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Inspect a route by name',
      value: `${packageName} routes inspect "API rewrite"`,
    },
    {
      name: 'Inspect a route by ID',
      value: `${packageName} routes inspect abc123`,
    },
    {
      name: 'Inspect a staged route',
      value: `${packageName} routes inspect "My route" --staging`,
    },
  ],
} as const;

export const routesCommand = {
  name: 'routes',
  aliases: ['route'],
  description:
    'Manage routing rules for a project. Routes managed at the project level apply to all deployments and environments.',
  arguments: [],
  subcommands: [listSubcommand, listVersionsSubcommand, inspectSubcommand],
  options: [],
  examples: [],
  hidden: true, // TODO: Remove when all routes subcommands are complete
} as const;
