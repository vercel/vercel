import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

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
  options: [],
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
  subcommands: [statusSubcommand],
  options: [
    {
      name: 'timeout',
      description: 'Time to wait for rollback completion [3m]',
      argument: 'TIME',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Rollback a deployment using id or url',
      value: `${packageName} rollback <deployment id/url>`,
    },
  ],
} as const;
