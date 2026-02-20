import { packageName } from '../../util/pkg-name';

// has to be ms compliant
// https://github.com/vercel/ms/blob/fe5338229cfdac6822891dcb9c24660b4d2e612b/src/index.ts#L95
export const CommandTimeout = '5 minutes';

export const logsCommand = {
  name: 'logs',
  aliases: ['log'],
  description:
    'Display request logs for a project.\n\n' +
    'Source types: λ = serverless, ε = edge/middleware, ◇ = static/external',
  arguments: [
    {
      name: 'url|deploymentId',
      required: false,
    },
  ],
  options: [
    {
      name: 'project',
      shorthand: 'p',
      type: String,
      deprecated: false,
      description: 'Project ID or name (defaults to linked project)',
    },
    {
      name: 'deployment',
      shorthand: 'd',
      type: String,
      deprecated: false,
      description:
        'Filter logs to a specific deployment ID or URL (alternative to positional argument)',
    },
    {
      name: 'environment',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Filter by environment: production or preview',
    },
    {
      name: 'level',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: 'Filter by log level: error, warning, info, fatal',
    },
    {
      name: 'status-code',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Filter by HTTP status code (e.g., 500, 4xx)',
    },
    {
      name: 'source',
      shorthand: null,
      type: [String],
      deprecated: false,
      description:
        'Filter by source: serverless, edge-function, edge-middleware, static',
    },
    {
      name: 'since',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Start time (ISO format or relative: 1h, 30m)',
    },
    {
      name: 'until',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'End time (ISO format or relative, default: now)',
    },
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      deprecated: false,
      description: 'Maximum number of results (default: 100)',
    },
    {
      name: 'json',
      shorthand: 'j',
      type: Boolean,
      deprecated: false,
      description: 'Output logs as JSON Lines for piping to other tools',
    },
    {
      name: 'follow',
      shorthand: 'f',
      type: Boolean,
      deprecated: false,
      description:
        'Stream live runtime logs (implicit when deployment URL/ID is specified)',
    },
    {
      name: 'no-follow',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Disable implicit --follow for deployment arguments',
    },
    {
      name: 'query',
      shorthand: 'q',
      type: String,
      deprecated: false,
      description: 'Full-text search query',
    },
    {
      name: 'request-id',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Filter by request ID',
    },
    {
      name: 'expand',
      shorthand: 'x',
      type: Boolean,
      deprecated: false,
      description: 'Show full log message below each request line',
    },
    {
      name: 'branch',
      shorthand: 'b',
      type: String,
      deprecated: false,
      description:
        'Filter by git branch (defaults to current branch when in a git repo)',
    },
    {
      name: 'no-branch',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Disable auto-detection of git branch',
    },
  ],
  examples: [
    {
      name: 'Stream live logs for a deployment URL',
      value: `${packageName} logs https://my-app-xxxxx.vercel.app`,
    },
    {
      name: 'Stream live logs for a deployment ID',
      value: `${packageName} logs dpl_xxxxx`,
    },
    {
      name: 'Display recent logs for the linked project',
      value: `${packageName} logs`,
    },
    {
      name: 'Display error logs from the last hour',
      value: `${packageName} logs --level error --since 1h`,
    },
    {
      name: 'Display logs for a specific deployment (historical)',
      value: `${packageName} logs dpl_xxxxx --no-follow`,
    },
    {
      name: 'Filter logs by status code and output as JSON',
      value: `${packageName} logs --status-code 500 --json`,
    },
    {
      name: 'Search logs and pipe to jq',
      value: `${packageName} logs --query "timeout" --json | jq '.message'`,
    },
    {
      name: 'Display production logs only',
      value: `${packageName} logs --environment production`,
    },
    {
      name: 'Display logs for a specific request',
      value: `${packageName} logs --request-id req_xxxxx`,
    },
    {
      name: 'Display logs with full message details',
      value: `${packageName} logs --expand`,
    },
    {
      name: 'Display logs for a specific branch',
      value: `${packageName} logs --branch feature-x`,
    },
    {
      name: 'Display logs for all branches (disable auto-detection)',
      value: `${packageName} logs --no-branch`,
    },
  ],
} as const;
