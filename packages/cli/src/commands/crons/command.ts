import { packageName } from '../../util/pkg-name';
import { formatOption, yesOption } from '../../util/arg-common';

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a cron job to the project',
  arguments: [],
  options: [
    {
      name: 'path',
      shorthand: null,
      type: String,
      argument: 'PATH',
      deprecated: false,
      description: 'The API route path for the cron job (must start with /)',
    },
    {
      name: 'schedule',
      shorthand: null,
      type: String,
      argument: 'EXPRESSION',
      deprecated: false,
      description: 'The cron schedule expression (e.g. "0 10 * * *")',
    },
    {
      name: 'host',
      shorthand: null,
      type: String,
      argument: 'HOSTNAME',
      deprecated: false,
      description:
        'The hostname for invocation (defaults to production deployment URL)',
    },
  ],
  examples: [
    {
      name: 'Add a cron job interactively',
      value: `${packageName} crons add`,
    },
    {
      name: 'Add a cron job with flags',
      value: `${packageName} crons add --path /api/cron --schedule "0 10 * * *"`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update an existing cron job',
  arguments: [],
  options: [
    {
      name: 'path',
      shorthand: null,
      type: String,
      argument: 'PATH',
      deprecated: false,
      description: 'The path of the cron job to update',
    },
    {
      name: 'schedule',
      shorthand: null,
      type: String,
      argument: 'EXPRESSION',
      deprecated: false,
      description: 'The new cron schedule expression',
    },
    {
      name: 'host',
      shorthand: null,
      type: String,
      argument: 'HOSTNAME',
      deprecated: false,
      description: 'The new hostname for invocation',
    },
  ],
  examples: [
    {
      name: 'Update a cron schedule',
      value: `${packageName} crons update --path /api/cron --schedule "0 0 * * *"`,
    },
  ],
} as const;

export const rmSubcommand = {
  name: 'rm',
  aliases: ['remove'],
  description: 'Remove a cron job from the project',
  arguments: [
    {
      name: 'path',
      required: false,
    },
  ],
  options: [yesOption],
  examples: [
    {
      name: 'Remove a cron job',
      value: `${packageName} crons rm /api/cron`,
    },
    {
      name: 'Remove without confirmation',
      value: `${packageName} crons rm /api/cron --yes`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all cron jobs for a project',
  default: true,
  arguments: [],
  options: [formatOption],
  examples: [
    {
      name: 'List all cron jobs',
      value: `${packageName} crons ls`,
    },
    {
      name: 'List all cron jobs as JSON',
      value: `${packageName} crons ls --format json`,
    },
  ],
} as const;

export const runSubcommand = {
  name: 'run',
  aliases: [],
  description: 'Trigger a cron job to run immediately',
  arguments: [
    {
      name: 'path',
      required: false,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Trigger a specific cron job',
      value: `${packageName} crons run /api/cron`,
    },
  ],
} as const;

export const cronsCommand = {
  name: 'crons',
  aliases: ['cron'],
  description: 'Manage cron jobs for a project',
  arguments: [],
  subcommands: [
    addSubcommand,
    updateSubcommand,
    rmSubcommand,
    listSubcommand,
    runSubcommand,
  ],
  options: [],
  examples: [],
} as const;
