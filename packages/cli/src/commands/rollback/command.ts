import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

const timeoutOption = {
  name: 'timeout',
  description: 'Time to wait for rollback completion (default: 3m)',
  argument: 'TIME',
  shorthand: null,
  type: String,
  deprecated: false,
} as const;

export const statusSubcommand = {
  name: 'status',
  aliases: [],
  description: 'Show the status of any current pending rollbacks',
  arguments: [
    {
      name: 'project',
      required: false,
    },
  ],
  options: [timeoutOption],
  examples: [
    {
      name: 'Show status for the linked project',
      value: `${packageName} rollback status`,
    },
    {
      name: 'Show status for a named project',
      placeholders: ['<project>'],
      value: `${packageName} rollback status <project>`,
    },
    {
      name: 'Wait up to 30 seconds for status',
      value: `${packageName} rollback status --timeout 30s`,
    },
  ],
} as const;

export const rollbackCommand = {
  name: 'rollback',
  aliases: [],
  description: 'Roll back to a previous deployment',
  arguments: [
    {
      name: 'deployment',
      required: true,
    },
  ],
  subcommands: [statusSubcommand],
  options: [timeoutOption, yesOption],
  examples: [
    {
      name: 'Rollback a deployment using id or url',
      placeholders: ['<DEPLOYMENT>'],
      value: `${packageName} rollback <DEPLOYMENT>`,
    },
  ],
} as const;
