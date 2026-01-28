import { packageName } from '../../util/pkg-name';
import { formatOption } from '../../util/arg-common';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all available API endpoints',
  arguments: [],
  options: [
    formatOption,
    {
      name: 'refresh',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Force refresh the cached OpenAPI spec',
    },
  ],
  examples: [
    {
      name: 'List all endpoints in table format',
      value: `${packageName} api ls`,
    },
    {
      name: 'List all endpoints as JSON',
      value: `${packageName} api ls --format json`,
    },
  ],
} as const;

export const apiCommand = {
  name: 'api',
  aliases: [],
  description: 'Make authenticated HTTP requests to the Vercel API',
  arguments: [
    {
      name: 'endpoint',
      required: false,
    },
  ],
  subcommands: [listSubcommand],
  options: [
    {
      name: 'method',
      shorthand: 'X',
      type: String,
      argument: 'METHOD',
      deprecated: false,
      description:
        'HTTP method (GET, POST, PUT, PATCH, DELETE). Defaults to GET, or POST if body is provided',
    },
    {
      name: 'field',
      shorthand: 'F',
      type: [String],
      argument: 'KEY=VALUE',
      deprecated: false,
      description:
        'Add a typed parameter (numbers, booleans parsed). Use @file for file contents',
    },
    {
      name: 'raw-field',
      shorthand: 'f',
      type: [String],
      argument: 'KEY=VALUE',
      deprecated: false,
      description: 'Add a string parameter (no type parsing)',
    },
    {
      name: 'header',
      shorthand: 'H',
      type: [String],
      argument: 'KEY:VALUE',
      deprecated: false,
      description: 'Add a custom HTTP header',
    },
    {
      name: 'input',
      shorthand: null,
      type: String,
      argument: 'FILE',
      deprecated: false,
      description: 'Read request body from file (use - for stdin)',
    },
    {
      name: 'paginate',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Fetch all pages of results',
    },
    {
      name: 'include',
      shorthand: 'i',
      type: Boolean,
      deprecated: false,
      description: 'Include response headers in output',
    },
    {
      name: 'silent',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Suppress response output',
    },
    {
      name: 'verbose',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Show debug information including full request/response',
    },
    {
      name: 'raw',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output raw JSON without pretty-printing',
    },
    {
      name: 'refresh',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Force refresh the cached OpenAPI spec',
    },
    {
      name: 'generate',
      shorthand: null,
      type: String,
      argument: 'FORMAT',
      deprecated: false,
      description:
        'Generate output instead of executing (e.g., --generate=curl)',
    },
    {
      name: 'dangerously-skip-permissions',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Skip confirmation prompts for DELETE operations (use with caution)',
    },
  ],
  examples: [
    {
      name: 'Get current user information',
      value: `${packageName} api /v2/user`,
    },
    {
      name: 'List projects with team scope',
      value: `${packageName} api /v9/projects --scope my-team`,
    },
    {
      name: 'Create a new project',
      value: `${packageName} api /v10/projects -X POST -F name=my-project`,
    },
    {
      name: 'Delete a deployment',
      value: `${packageName} api /v13/deployments/dpl_abc123 -X DELETE`,
    },
    {
      name: 'Paginate through all deployments',
      value: `${packageName} api /v6/deployments --paginate`,
    },
    {
      name: 'Post JSON from file',
      value: `${packageName} api /v10/projects -X POST --input config.json`,
    },
    {
      name: 'Add custom header',
      value: `${packageName} api /v2/user -H "X-Custom-Header: value"`,
    },
    {
      name: 'Interactive mode (select endpoint)',
      value: `${packageName} api`,
    },
  ],
} as const;
