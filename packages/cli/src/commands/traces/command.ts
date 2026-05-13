import { packageName } from '../../util/pkg-name';

export const getSubcommand = {
  name: 'get',
  aliases: [],
  default: true,
  description: 'Fetch a captured trace by request id.',
  arguments: [{ name: 'requestId', required: false }],
  options: [
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Print the raw trace JSON to stdout instead of a summary.',
    },
    {
      name: 'project',
      shorthand: null,
      type: String,
      argument: 'NAME|ID',
      deprecated: false,
      description:
        'Project name or id to fetch the trace from (overrides the linked project).',
    },
    {
      name: 'timeout',
      shorthand: null,
      type: Number,
      argument: 'MS',
      deprecated: false,
      description:
        'Total wall-clock budget in milliseconds to wait for the trace to become available. Defaults to 30000.',
    },
    {
      name: 'no-wait',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Skip the retry loop. Make a single attempt and exit immediately.',
    },
  ],
  examples: [
    {
      name: 'Fetch a trace by request id',
      value: `${packageName} traces get req_1234567890`,
    },
    {
      name: 'Print the raw trace JSON',
      value: `${packageName} traces get req_1234567890 --json`,
    },
    {
      name: 'Wait up to 60 seconds for the trace to be available',
      value: `${packageName} traces get req_1234567890 --timeout 60000`,
    },
    {
      name: 'Skip retries and fail immediately on a missing trace',
      value: `${packageName} traces get req_1234567890 --no-wait`,
    },
    {
      name: '`get` is the default — this is equivalent to the above',
      value: `${packageName} traces req_1234567890`,
    },
    {
      name: 'Fetch a trace from a specific team and project',
      value: `${packageName} traces get req_1234567890 --scope my-team --project my-app`,
    },
  ],
} as const;

export const tracesCommand = {
  name: 'traces',
  aliases: [],
  description: 'Fetch traces captured for a Vercel project.',
  arguments: [{ name: 'requestId', required: false }],
  subcommands: [getSubcommand],
  options: [],
  examples: [
    {
      name: 'Fetch a trace by request id',
      value: `${packageName} traces get req_1234567890`,
    },
    {
      name: 'Print the raw trace JSON',
      value: `${packageName} traces get req_1234567890 --json`,
    },
  ],
} as const;
