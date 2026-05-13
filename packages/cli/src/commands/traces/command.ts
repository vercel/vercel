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
