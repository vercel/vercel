import { packageName } from '../../util/pkg-name';

export const logsv2Command = {
  name: 'logsv2',
  aliases: [],
  description: 'Display request logs for a project using the new logs API.',
  hidden: true,
  arguments: [],
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
      description: 'Filter logs to a specific deployment ID or URL',
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
        'Stream live runtime logs (requires --deployment, no other filters allowed)',
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
  ],
  examples: [
    {
      name: 'Display recent logs for the linked project',
      value: `${packageName} logsv2`,
    },
    {
      name: 'Display error logs from the last hour',
      value: `${packageName} logsv2 --level error --since 1h`,
    },
    {
      name: 'Display logs for a specific deployment',
      value: `${packageName} logsv2 --deployment dpl_xxxxx`,
    },
    {
      name: 'Filter logs by status code and output as JSON',
      value: `${packageName} logsv2 --status-code 500 --json`,
    },
    {
      name: 'Search logs and pipe to jq',
      value: `${packageName} logsv2 --query "timeout" --json | jq '.message'`,
    },
    {
      name: 'Display production logs only',
      value: `${packageName} logsv2 --environment production`,
    },
    {
      name: 'Display logs for a specific request',
      value: `${packageName} logsv2 --request-id req_xxxxx`,
    },
    {
      name: 'Stream live logs for a deployment',
      value: `${packageName} logsv2 --deployment dpl_xxxxx --follow`,
    },
  ],
} as const;
