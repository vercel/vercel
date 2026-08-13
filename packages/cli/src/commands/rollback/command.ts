import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

const timeoutOption = {
  name: 'timeout',
  description: 'Time to wait for rollback completion [3m]',
  argument: 'TIME',
  shorthand: null,
  type: String,
  deprecated: false,
} as const;

const descriptionOption = {
  name: 'description',
  description: 'The reason for the rollback',
  argument: 'TEXT',
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
      name: 'Show the status of any current pending rollbacks',
      value: [
        `${packageName} rollback status`,
        `${packageName} rollback status <project>`,
        `${packageName} rollback status --timeout 30s`,
      ],
    },
  ],
} as const;

export const describeSubcommand = {
  name: 'describe',
  aliases: [],
  description: 'Edit the description attached to an existing rollback',
  arguments: [
    {
      name: 'url|deploymentId',
      required: true,
    },
  ],
  options: [descriptionOption],
  examples: [
    {
      name: 'Edit the description attached to a rollback',
      value: `${packageName} rollback describe <deployment id/url> --description "Reverting checkout regression"`,
    },
  ],
} as const;

export const rollbackCommand = {
  name: 'rollback',
  aliases: [],
  description: 'Quickly revert back to a previous deployment',
  arguments: [
    {
      name: 'url|deploymentId',
      required: true,
    },
  ],
  subcommands: [statusSubcommand, describeSubcommand],
  options: [timeoutOption, yesOption],
  examples: [
    {
      name: 'Rollback a deployment using id or url',
      value: `${packageName} rollback <deployment id/url>`,
    },
  ],
} as const;
