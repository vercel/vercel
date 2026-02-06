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
      description: 'Filter by type: rewrite, redirect, set_status, transform',
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
      name: 'diff',
      description: 'Show changes between staging and production for this route',
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
      name: 'Show staged changes for a route',
      value: `${packageName} routes inspect "My route" --diff`,
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
      name: 'src-syntax',
      description: 'Path syntax: regex (default), path-to-regexp, equals',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
    },
    // Primary Actions
    {
      name: 'action',
      description:
        'Action type: rewrite, redirect, or set-status (required with --dest/--status)',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
    },
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
      value: `${packageName} routes add "API Proxy" --src "/api/:path*" --src-syntax path-to-regexp --action rewrite --dest "https://api.example.com/:path*" --yes`,
    },
    {
      name: 'Add a redirect',
      value: `${packageName} routes add "Old Blog" --src "/blog" --src-syntax equals --action redirect --dest "/articles" --status 301 --yes`,
    },
    {
      name: 'Add CORS headers',
      value: `${packageName} routes add "CORS" --src "^/api/.*$" --set-response-header "Access-Control-Allow-Origin=*" --yes`,
    },
    {
      name: 'Block access (set status)',
      value: `${packageName} routes add "Block Admin" --src "^/admin/.*$" --action set-status --status 403 --yes`,
    },
    {
      name: 'Conditional redirect',
      value: `${packageName} routes add "Auth Required" --src "/protected/:path*" --src-syntax path-to-regexp --action redirect --dest "/login" --status 307 --missing "cookie:session" --yes`,
    },
    {
      name: 'Rewrite with request headers',
      value: `${packageName} routes add "Backend Proxy" --src "/backend/:path*" --src-syntax path-to-regexp --action rewrite --dest "https://internal.example.com/:path*" --set-request-header "X-Forwarded-Host=myapp.com" --yes`,
    },
    {
      name: 'Add route at start',
      value: `${packageName} routes add "Priority Route" --src "/priority" --src-syntax equals --action rewrite --dest "/handler" --position start --yes`,
    },
  ],
} as const;

export const publishSubcommand = {
  name: 'publish',
  aliases: [],
  description: 'Publish staged routing changes to production',
  arguments: [],
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
  name: 'discard-staging',
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
      value: `${packageName} routes discard-staging`,
    },
    {
      name: 'Discard without confirmation',
      value: `${packageName} routes discard-staging --yes`,
    },
  ],
} as const;

export const deleteSubcommand = {
  name: 'delete',
  aliases: ['rm'],
  description: 'Delete one or more routing rules',
  arguments: [
    {
      name: 'name-or-id',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting',
    },
  ],
  examples: [
    {
      name: 'Delete a route by name',
      value: `${packageName} routes delete "Old Redirect"`,
    },
    {
      name: 'Delete a route by ID',
      value: `${packageName} routes delete abc123`,
    },
    {
      name: 'Delete multiple routes',
      value: `${packageName} routes delete "Route A" "Route B"`,
    },
    {
      name: 'Delete without confirmation',
      value: `${packageName} routes delete "Old Route" --yes`,
    },
  ],
} as const;

export const enableSubcommand = {
  name: 'enable',
  aliases: [],
  description: 'Enable a disabled routing rule',
  arguments: [
    {
      name: 'name-or-id',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Enable a route by name',
      value: `${packageName} routes enable "API Proxy"`,
    },
    {
      name: 'Enable a route by ID',
      value: `${packageName} routes enable abc123`,
    },
  ],
} as const;

export const disableSubcommand = {
  name: 'disable',
  aliases: [],
  description: 'Disable a routing rule without deleting it',
  arguments: [
    {
      name: 'name-or-id',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Disable a route by name',
      value: `${packageName} routes disable "API Proxy"`,
    },
    {
      name: 'Disable a route by ID',
      value: `${packageName} routes disable abc123`,
    },
  ],
} as const;

export const reorderSubcommand = {
  name: 'reorder',
  aliases: ['move'],
  description: 'Move a routing rule to a different position',
  arguments: [
    {
      name: 'name-or-id',
      required: true,
    },
  ],
  options: [
    {
      name: 'position',
      description:
        'Target position: start, end, a number (1-based), before:<id>, after:<id>',
      shorthand: null,
      type: String,
      argument: 'POSITION',
      deprecated: false,
    },
    {
      name: 'first',
      description: 'Move to the first position (highest priority)',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'last',
      description: 'Move to the last position (lowest priority)',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when reordering',
    },
  ],
  examples: [
    {
      name: 'Move to first position',
      value: `${packageName} routes reorder "Catch All" --first`,
    },
    {
      name: 'Move to last position',
      value: `${packageName} routes reorder "Catch All" --last`,
    },
    {
      name: 'Move to a specific position',
      value: `${packageName} routes reorder "API Proxy" --position 3`,
    },
    {
      name: 'Move after another route',
      value: `${packageName} routes reorder "API Proxy" --position after:route-id-123`,
    },
    {
      name: 'Interactive reorder (prompts for position)',
      value: `${packageName} routes reorder "API Proxy"`,
    },
  ],
} as const;

export const editSubcommand = {
  name: 'edit',
  aliases: [],
  description: 'Edit an existing routing rule',
  arguments: [
    {
      name: 'name-or-id',
      required: true,
    },
  ],
  options: [
    // Metadata
    {
      name: 'name',
      description: 'Change route name',
      shorthand: null,
      type: String,
      argument: 'NAME',
      deprecated: false,
    },
    {
      name: 'description',
      description: 'Change description (use "" to clear)',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: false,
    },
    // Path & Matching
    {
      name: 'src',
      description: 'Change source path pattern',
      shorthand: null,
      type: String,
      argument: 'PATTERN',
      deprecated: false,
    },
    {
      name: 'src-syntax',
      description: 'Change path syntax: regex, path-to-regexp, equals',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
    },
    // Primary action
    {
      name: 'action',
      description:
        'Set action type: rewrite, redirect, or set-status (required when switching types)',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
    },
    {
      name: 'dest',
      description: 'Set destination URL',
      shorthand: null,
      type: String,
      argument: 'URL',
      deprecated: false,
    },
    {
      name: 'status',
      description: 'Set status code',
      shorthand: null,
      type: Number,
      argument: 'CODE',
      deprecated: false,
    },
    {
      name: 'no-dest',
      description: 'Remove destination',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'no-status',
      description: 'Remove status code',
      shorthand: null,
      type: Boolean,
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
        'Add a has condition: type:key or type:key:value (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'CONDITION',
      deprecated: false,
    },
    {
      name: 'missing',
      description:
        'Add a missing condition: type:key or type:key:value (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'CONDITION',
      deprecated: false,
    },
    // Clearing
    {
      name: 'clear-conditions',
      description: 'Remove all has/missing conditions',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'clear-headers',
      description: 'Remove all response headers',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'clear-transforms',
      description: 'Remove all transforms (request headers, request query)',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip confirmation prompts',
    },
  ],
  examples: [
    {
      name: 'Interactive mode',
      value: `${packageName} routes edit "API Proxy"`,
    },
    {
      name: 'Change destination',
      value: `${packageName} routes edit "API Proxy" --dest "https://new-api.example.com/:path*"`,
    },
    {
      name: 'Switch to redirect',
      value: `${packageName} routes edit "Old Route" --action redirect --dest "/new" --status 301`,
    },
    {
      name: 'Add a response header',
      value: `${packageName} routes edit "My Route" --set-response-header "Cache-Control=public, max-age=3600"`,
    },
    {
      name: 'Clear all conditions and add new ones',
      value: `${packageName} routes edit "My Route" --clear-conditions --has "header:Authorization"`,
    },
  ],
} as const;

export const routesCommand = {
  name: 'routes',
  aliases: [],
  description:
    'Manage routing rules for a project. Routes managed at the project level apply to all deployments and environments.',
  arguments: [],
  subcommands: [
    listSubcommand,
    listVersionsSubcommand,
    inspectSubcommand,
    addSubcommand,
    editSubcommand,
    deleteSubcommand,
    enableSubcommand,
    disableSubcommand,
    reorderSubcommand,
    publishSubcommand,
    restoreSubcommand,
    discardSubcommand,
  ],
  options: [],
  examples: [],
  hidden: true, // TODO: Remove when all routes subcommands are complete
} as const;
