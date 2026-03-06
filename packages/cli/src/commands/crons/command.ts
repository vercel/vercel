import { packageName } from '../../util/pkg-name';
import { formatOption } from '../../util/arg-common';

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
  subcommands: [listSubcommand, runSubcommand],
  options: [],
  examples: [],
} as const;
