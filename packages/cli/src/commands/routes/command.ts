import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

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
        'Filter by type: header, rewrite, redirect, set_status, transform',
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

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a new routing rule to the project',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [
    // Path & Matching
    {
      name: 'src',
      description: 'Path pattern (required in non-interactive mode)',
      shorthand: null,
      type: String,
      argument: 'PATTERN',
      deprecated: false,
    },
    {
      name: 'syntax',
      description: 'Path syntax: regex (default), path-to-regexp, equals',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
    },
    // Primary Actions
    {
      name: 'dest',
      description: 'Destination URL for rewrite or redirect',
      shorthand: null,
      type: String,
      argument: 'URL',
      deprecated: false,
    },
    {
      name: 'status',
      description:
        'Status code (301/302/307/308 for redirect, or any for set-status)',
      shorthand: null,
      type: Number,
      argument: 'CODE',
      deprecated: false,
    },
    // Response Headers
    {
      name: 'set-response-header',
      description: 'Set response header: key=value (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'HEADER',
      deprecated: false,
    },
    {
      name: 'append-response-header',
      description: 'Append to response header: key=value (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'HEADER',
      deprecated: false,
    },
    {
      name: 'delete-response-header',
      description: 'Delete response header: key (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'KEY',
      deprecated: false,
    },
    // Request Headers
    {
      name: 'set-request-header',
      description: 'Set request header: key=value (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'HEADER',
      deprecated: false,
    },
    {
      name: 'append-request-header',
      description: 'Append to request header: key=value (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'HEADER',
      deprecated: false,
    },
    {
      name: 'delete-request-header',
      description: 'Delete request header: key (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'KEY',
      deprecated: false,
    },
    // Request Query
    {
      name: 'set-request-query',
      description: 'Set query parameter: key=value (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'PARAM',
      deprecated: false,
    },
    {
      name: 'append-request-query',
      description: 'Append to query parameter: key=value (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'PARAM',
      deprecated: false,
    },
    {
      name: 'delete-request-query',
      description: 'Delete query parameter: key (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'KEY',
      deprecated: false,
    },
    // Conditions
    {
      name: 'has',
      description:
        'Condition that must match: type:key or type:key:value (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'CONDITION',
      deprecated: false,
    },
    {
      name: 'missing',
      description:
        'Condition that must NOT match: type:key or type:key:value (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'CONDITION',
      deprecated: false,
    },
    // Metadata
    {
      name: 'description',
      description: 'Route description (max 1024 chars)',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: false,
    },
    {
      name: 'disabled',
      description: 'Create route in disabled state',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'position',
      description: 'Position: start, end, after:<id>, before:<id>',
      shorthand: null,
      type: String,
      argument: 'POSITION',
      deprecated: false,
    },
    {
      name: 'yes',
      description: 'Skip confirmation prompts',
      shorthand: 'y',
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Interactive mode',
      value: `${packageName} routes add`,
    },
    {
      name: 'Add a rewrite',
      value: `${packageName} routes add "API Proxy" --src "/api/:path*" --syntax path-to-regexp --dest "https://api.example.com/:path*" --yes`,
    },
    {
      name: 'Add a redirect',
      value: `${packageName} routes add "Old Blog" --src "/blog" --syntax equals --dest "/articles" --status 301 --yes`,
    },
    {
      name: 'Add CORS headers',
      value: `${packageName} routes add "CORS" --src "^/api/.*$" --set-response-header "Access-Control-Allow-Origin=*" --set-response-header "Access-Control-Allow-Methods=GET,POST" --yes`,
    },
    {
      name: 'Block access (set status)',
      value: `${packageName} routes add "Block Admin" --src "^/admin/.*$" --status 403 --yes`,
    },
    {
      name: 'Conditional routing',
      value: `${packageName} routes add "Auth Required" --src "/protected/:path*" --syntax path-to-regexp --dest "/login" --status 307 --missing "cookie:session" --yes`,
    },
    {
      name: 'Rewrite with request headers',
      value: `${packageName} routes add "Backend Proxy" --src "/backend/:path*" --syntax path-to-regexp --dest "https://internal.example.com/:path*" --set-request-header "X-Forwarded-Host=myapp.com" --yes`,
    },
    {
      name: 'Add route at start',
      value: `${packageName} routes add "Priority Route" --src "/priority" --syntax equals --dest "/handler" --position start --yes`,
    },
  ],
} as const;

export const publishSubcommand = {
  name: 'publish',
  aliases: [],
  description: 'Publish staged routing changes to production',
  arguments: [
    {
      name: 'version-id',
      required: false,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when publishing',
    },
  ],
  examples: [
    {
      name: 'Publish staged changes',
      value: `${packageName} routes publish`,
    },
    {
      name: 'Publish a specific version',
      value: `${packageName} routes publish <version-id>`,
    },
    {
      name: 'Publish without confirmation',
      value: `${packageName} routes publish --yes`,
    },
  ],
} as const;

export const restoreSubcommand = {
  name: 'restore',
  aliases: [],
  description: 'Restore a previous routing version to production',
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
      name: 'Restore a previous version',
      value: `${packageName} routes restore <version-id>`,
    },
    {
      name: 'Restore without confirmation',
      value: `${packageName} routes restore <version-id> --yes`,
    },
  ],
} as const;

export const discardSubcommand = {
  name: 'discard',
  aliases: [],
  description: 'Discard staged routing changes',
  arguments: [],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when discarding',
    },
  ],
  examples: [
    {
      name: 'Discard staged changes',
      value: `${packageName} routes discard`,
    },
    {
      name: 'Discard without confirmation',
      value: `${packageName} routes discard --yes`,
    },
  ],
} as const;

export const routesCommand = {
  name: 'routes',
  aliases: ['route'],
  description:
    'Manage routing rules for a project. Routes managed at the project level apply to all deployments and environments.',
  arguments: [],
  subcommands: [
    listSubcommand,
    listVersionsSubcommand,
    inspectSubcommand,
    addSubcommand,
    publishSubcommand,
    restoreSubcommand,
    discardSubcommand,
  ],
  options: [],
  examples: [],
  hidden: true, // TODO: Remove when all routes subcommands are complete
} as const;
