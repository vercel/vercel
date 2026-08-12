import { packageName } from '../../util/pkg-name';
import { formatOption, jsonOption, yesOption } from '../../util/arg-common';

const nameOption = {
  name: 'name',
  shorthand: null,
  type: String,
  argument: 'NAME',
  deprecated: false,
  description: 'Name of the drain',
} as const;

const endpointOption = {
  name: 'endpoint',
  shorthand: null,
  type: String,
  argument: 'URL',
  deprecated: false,
  description: 'HTTPS endpoint that receives the events',
} as const;

const encodingOption = {
  name: 'encoding',
  shorthand: null,
  type: String,
  argument: 'ENCODING',
  deprecated: false,
  description: 'Delivery encoding (json, ndjson)',
} as const;

const compressionOption = {
  name: 'compression',
  shorthand: null,
  type: String,
  argument: 'COMPRESSION',
  deprecated: false,
  description: 'Delivery compression (gzip, none)',
} as const;

const headerOption = {
  name: 'header',
  shorthand: null,
  type: [String],
  argument: 'KEY: VALUE',
  deprecated: false,
  description: 'Custom HTTP header sent with each delivery (repeatable)',
} as const;

const secretOption = {
  name: 'secret',
  shorthand: null,
  type: String,
  argument: 'VALUE',
  deprecated: false,
  description: 'Secret used to sign delivered payloads (x-vercel-signature)',
} as const;

const drainProjectOption = {
  name: 'project',
  shorthand: null,
  type: [String],
  argument: 'ID',
  deprecated: false,
  description: 'Project ID to scope the drain to (repeatable, default all)',
} as const;

const samplingOption = {
  name: 'sampling',
  shorthand: null,
  type: Number,
  argument: 'RATE',
  deprecated: false,
  description: 'Sampling rate from 0 to 1 (e.g. 0.1 delivers 10%)',
} as const;

const environmentOption = {
  name: 'environment',
  shorthand: null,
  type: String,
  argument: 'ENVIRONMENT',
  deprecated: false,
  description:
    'Environment the sampling rate applies to (production, preview); requires --sampling',
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all drains on the current scope',
  default: true,
  arguments: [],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'List all drains on the current scope',
      value: `${packageName} drains ls`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show a drain in full',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Show a drain in full',
      value: `${packageName} drains inspect drn_1a2b3c4d5e6f`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Create a drain that delivers events to an HTTPS endpoint',
  arguments: [],
  options: [
    nameOption,
    {
      name: 'type',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
      description:
        'Data type to deliver (log, trace, analytics, speed_insights, ai_gateway, audit_log, connect)',
    },
    endpointOption,
    encodingOption,
    compressionOption,
    headerOption,
    secretOption,
    drainProjectOption,
    samplingOption,
    environmentOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Create a log drain',
      value: `${packageName} drains add --name prod-logs --type log --endpoint https://logs.example.com/ingest`,
    },
    {
      name: 'Create a sampled trace drain scoped to a project',
      value: `${packageName} drains add --name traces --type trace --endpoint https://traces.example.com --project prj_1a2b3c --sampling 0.25`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update an existing drain using its ID',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [
    nameOption,
    endpointOption,
    encodingOption,
    compressionOption,
    headerOption,
    secretOption,
    drainProjectOption,
    samplingOption,
    environmentOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Rename a drain',
      value: `${packageName} drains update drn_1a2b3c4d5e6f --name staging-logs`,
    },
    {
      name: 'Point a drain at a new endpoint',
      value: `${packageName} drains update drn_1a2b3c4d5e6f --endpoint https://logs.example.com/v2`,
    },
  ],
} as const;

export const testSubcommand = {
  name: 'test',
  aliases: [],
  description: 'Send a test event through a drain to validate its delivery',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Send a test event to a drain',
      value: `${packageName} drains test drn_1a2b3c4d5e6f`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove a drain using its ID',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when removing a drain',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Remove a drain',
      value: `${packageName} drains rm drn_1a2b3c4d5e6f`,
    },
    {
      name: 'Remove a drain without the confirmation prompt',
      value: `${packageName} drains rm drn_1a2b3c4d5e6f --yes`,
    },
  ],
} as const;

export const pauseSubcommand = {
  name: 'pause',
  aliases: [],
  description: 'Pause a drain using its ID',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Pause a drain',
      value: `${packageName} drains pause drn_1a2b3c4d5e6f`,
    },
  ],
} as const;

export const resumeSubcommand = {
  name: 'resume',
  aliases: [],
  description: 'Resume a paused drain using its ID',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Resume a paused drain',
      value: `${packageName} drains resume drn_1a2b3c4d5e6f`,
    },
  ],
} as const;

export const drainsCommand = {
  name: 'drains',
  aliases: [],
  description: 'Manage Log, Trace, and other observability Drains',
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    addSubcommand,
    updateSubcommand,
    testSubcommand,
    removeSubcommand,
    pauseSubcommand,
    resumeSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List all drains on the current scope',
      value: `${packageName} drains ls`,
    },
    {
      name: 'Show a drain in full',
      value: `${packageName} drains inspect drn_a1b2c3d4e5f6`,
    },
    {
      name: 'Create a log drain',
      value: `${packageName} drains add --name prod-logs --type log --endpoint https://logs.example.com/ingest`,
    },
    {
      name: 'Remove a drain',
      value: `${packageName} drains rm drn_a1b2c3d4e5f6`,
    },
    {
      name: 'Pause and resume a drain',
      value: [
        `${packageName} drains pause drn_a1b2c3d4e5f6`,
        `${packageName} drains resume drn_a1b2c3d4e5f6`,
      ],
    },
  ],
} as const;
