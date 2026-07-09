import { packageName } from '../../util/pkg-name';
import {
  deploymentOption,
  protectionBypassOption,
  yesOption,
} from '../../util/arg-common';

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
      description:
        'Print the raw trace JSON to stdout instead of the markdown summary.',
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
      name: 'open',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Open the trace in the Vercel Dashboard instead of printing it.',
    },
    {
      name: 'view',
      shorthand: null,
      type: String,
      argument: 'timeline|tree|waterfall',
      deprecated: false,
      description:
        'Dashboard view to open. Only valid with --open. Defaults to timeline.',
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
    {
      name: 'Open the trace in the Vercel Dashboard',
      value: `${packageName} traces get req_1234567890 --open`,
    },
    {
      name: 'Open the trace in the Vercel Dashboard with the waterfall view',
      value: `${packageName} traces get req_1234567890 --open --view waterfall`,
    },
  ],
} as const;

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description:
    'Capture a session trace for a request (alias for `vercel curl --trace`).',
  arguments: [{ name: 'path', required: true }],
  options: [
    deploymentOption,
    protectionBypassOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Emit { response, requestId } as JSON on stdout',
    },
    {
      ...yesOption,
      description:
        'Skip the production confirmation prompt (e.g. in non-interactive mode)',
    },
  ],
  examples: [
    {
      name: 'Capture a session trace for a request',
      value: `${packageName} traces create /api/hello`,
    },
    {
      name: 'Target a specific deployment',
      value: `${packageName} traces create /api/status --deployment https://your-project-abc123.vercel.app`,
    },
    {
      name: 'Pass curl flags after the separator',
      value: `${packageName} traces create /api/test -- --request POST --data '{"name": "John"}'`,
    },
  ],
} as const;

export const tracesCommand = {
  name: 'traces',
  aliases: [],
  description: 'Fetch traces captured for a Vercel project.',
  arguments: [{ name: 'requestId', required: false }],
  subcommands: [getSubcommand, createSubcommand],
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
    {
      name: 'Capture a session trace for a request',
      value: `${packageName} traces create /api/hello`,
    },
  ],
} as const;
