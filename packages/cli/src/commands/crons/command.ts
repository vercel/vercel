import { packageName } from '../../util/pkg-name';
import { formatOption } from '../../util/arg-common';

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a cron job to vercel.json',
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
  subcommands: [addSubcommand, listSubcommand, runSubcommand],
  options: [],
  examples: [],
} as const;
