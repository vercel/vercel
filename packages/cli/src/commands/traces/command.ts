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
