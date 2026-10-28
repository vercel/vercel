import {
  allOption,
  environmentOption,
  jsonOption,
  limitOption,
  nextCursorOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

const drainArgument = { name: 'drain', required: true } as const;

const nameOption = {
  name: 'name',
  shorthand: null,
  type: String,
  argument: 'NAME',
  deprecated: false,
  description: 'Name of the drain',
} as const;

const urlOption = {
  name: 'url',
  shorthand: null,
  type: String,
  argument: 'URL',
  deprecated: false,
  description: 'Endpoint that receives the data (http or https)',
} as const;

const typeOption = {
  name: 'type',
  shorthand: null,
  type: String,
  argument: 'TYPE',
  deprecated: false,
  description:
    'Data to send: logs, traces, analytics, or speed-insights (required)',
} as const;

const encodingOption = {
  name: 'encoding',
  shorthand: null,
  type: String,
  argument: 'ENCODING',
  deprecated: false,
  description:
    'Body encoding: json or ndjson, or json or proto for traces (default: json)',
} as const;

const headerOption = {
  name: 'header',
  shorthand: null,
  type: [String],
  argument: 'KEY:VALUE',
  deprecated: false,
  description: 'Header sent with each request (repeatable)',
} as const;

const secretOption = {
  name: 'secret',
  shorthand: null,
  type: String,
  argument: 'VALUE',
  deprecated: false,
  description:
    'Secret that signs each request in the x-vercel-signature header; use - to read it from stdin',
} as const;

const projectsOption = {
  ...projectOption,
  shorthand: 'p',
  description: 'Only send data from these projects, comma-separated',
} as const;

const sourceOption = {
  name: 'source',
  shorthand: null,
  type: [String],
  argument: 'SOURCE',
  deprecated: false,
  description:
    'Log source to send for logs drains, repeatable: lambda, edge, static, external, build, firewall, or redirect (default: all)',
} as const;

const environmentsOption = {
  ...environmentOption,
  type: [String],
  description:
    'Only send data from this environment, for logs drains, repeatable: production or preview (default: all)',
} as const;

const sampleRateOption = {
  name: 'sample-rate',
  shorthand: null,
  type: Number,
  argument: 'PERCENT',
  deprecated: false,
  description: 'Percentage of data to send, from 1 to 100 (default: 100)',
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List drains',
  default: true,
  arguments: [],
  options: [
    {
      ...projectOption,
      shorthand: 'p',
      description: 'Only list drains that send data from this project',
    },
    { ...limitOption, shorthand: 'n' },
    nextCursorOption,
    jsonOption,
  ],
  examples: [
    { name: 'List drains', value: `${packageName} drains list` },
    {
      name: 'List drains for a project',
      value: `${packageName} drains list --project acme-web`,
    },
    {
      name: 'List drains as JSON',
      value: `${packageName} drains list --json`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show a drain',
  arguments: [drainArgument],
  options: [jsonOption],
  examples: [
    {
      name: 'Show a drain',
      value: `${packageName} drains inspect drn_a1b2c3d4e5f6g7h8`,
    },
    {
      name: 'Show a drain as JSON',
      value: `${packageName} drains inspect drn_a1b2c3d4e5f6g7h8 --json`,
    },
  ],
} as const;

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create a drain',
  arguments: [],
  options: [
    { ...nameOption, description: 'Name of the drain (required)' },
    { ...urlOption, description: `${urlOption.description} (required)` },
    typeOption,
    encodingOption,
    headerOption,
    secretOption,
    projectsOption,
    sourceOption,
    environmentsOption,
    sampleRateOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Send all logs to an endpoint',
      value: `${packageName} drains create --name acme-logs --type logs --url https://example.com/drain`,
    },
    {
      name: 'Send production function and edge logs from one project',
      value: `${packageName} drains create --name acme-web-logs --type logs --url https://example.com/drain --project acme-web,acme-api --environment production --source lambda --source edge`,
    },
    {
      name: 'Send 10% of traces to an OTLP endpoint with an auth header',
      placeholders: ['<TOKEN>'],
      value: `${packageName} drains create --name acme-traces --type traces --url https://example.com/v1/traces --header "Authorization: Bearer <TOKEN>" --sample-rate 10`,
    },
    {
      name: 'Sign requests with a secret read from stdin',
      value: `${packageName} drains create --name acme-logs --type logs --url https://example.com/drain --secret -`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update a drain; omitted options stay unchanged',
  arguments: [drainArgument],
  options: [
    nameOption,
    urlOption,
    {
      ...encodingOption,
      description:
        'Body encoding: json or ndjson, or json or proto for traces (default: the current encoding)',
    },
    {
      ...headerOption,
      description: 'Header sent with each request; replaces all headers',
    },
    {
      ...secretOption,
      description: 'Replace the signing secret; use - to read it from stdin',
    },
    {
      ...projectsOption,
      description:
        'Only send data from these projects, comma-separated; replaces the projects',
    },
    {
      ...allOption,
      description: 'Send data from all projects',
    },
    {
      ...sourceOption,
      description:
        'Log source to send for logs drains, repeatable; replaces the sources',
    },
    {
      ...environmentsOption,
      description:
        'Only send data from this environment, for logs drains: production or preview; replaces the environments',
    },
    {
      ...sampleRateOption,
      description: 'Percentage of data to send, from 1 to 100',
    },
    jsonOption,
  ],
  examples: [
    {
      name: 'Change the endpoint',
      value: `${packageName} drains update drn_a1b2c3d4e5f6g7h8 --url https://example.com/new-drain`,
    },
    {
      name: 'Send data from all projects again',
      value: `${packageName} drains update drn_a1b2c3d4e5f6g7h8 --all`,
    },
    {
      name: 'Send every request again',
      value: `${packageName} drains update drn_a1b2c3d4e5f6g7h8 --sample-rate 100`,
    },
  ],
} as const;

export const pauseSubcommand = {
  name: 'pause',
  aliases: [],
  description: 'Pause a drain; data generated while it is paused is not sent',
  arguments: [drainArgument],
  options: [
    { ...yesOption, description: 'Pause without a confirmation prompt' },
    jsonOption,
  ],
  examples: [
    {
      name: 'Pause a drain',
      value: `${packageName} drains pause drn_a1b2c3d4e5f6g7h8`,
    },
    {
      name: 'Pause a drain in CI',
      value: `${packageName} drains pause drn_a1b2c3d4e5f6g7h8 --yes`,
    },
  ],
} as const;

export const resumeSubcommand = {
  name: 'resume',
  aliases: [],
  description: 'Resume a paused drain',
  arguments: [drainArgument],
  options: [jsonOption],
  examples: [
    {
      name: 'Resume a drain',
      value: `${packageName} drains resume drn_a1b2c3d4e5f6g7h8`,
    },
  ],
} as const;

export const deleteSubcommand = {
  name: 'delete',
  aliases: ['rm', 'del'],
  description: 'Delete a drain',
  arguments: [drainArgument],
  options: [
    { ...yesOption, description: 'Delete without a confirmation prompt' },
    jsonOption,
  ],
  examples: [
    {
      name: 'Delete a drain',
      value: `${packageName} drains delete drn_a1b2c3d4e5f6g7h8`,
    },
    {
      name: 'Delete a drain in CI',
      value: `${packageName} drains delete drn_a1b2c3d4e5f6g7h8 --yes`,
    },
  ],
} as const;

export const drainsCommand = {
  name: 'drains',
  aliases: ['drain'],
  description: 'Manage drains for logs, traces, analytics, and speed insights',
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    createSubcommand,
    updateSubcommand,
    pauseSubcommand,
    resumeSubcommand,
    deleteSubcommand,
  ],
  options: [],
  examples: [],
} as const;
