import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const rollbackCommand: Command = {
  name: 'rollback',
  description: 'Quickly revert back to a previous deployment.',
  arguments: [
    {
      name: 'deployment id/url',
      required: true,
    },
  ],
  subcommands: [
    {
      name: 'status',
      description: 'Show the status of any current pending rollbacks',
      arguments: [
        {
          name: 'project',
          required: false,
        },
      ],
      options: [],
      examples: [],
    },
  ],
  options: [
    {
      name: 'timeout',
      description: 'Time to wait for rollback completion [3m]',
      argument: 'timeout',
      shorthand: null,
      type: 'string',
      deprecated: false,
      multi: false,
    },
  ],
  examples: [
    {
      name: 'Show the status of any current pending rollbacks',
      value: [
        `${packageName} rollback`,
        `${packageName} rollback status`,
        `${packageName} rollback status <project>`,
        `${packageName} rollback status --timeout 30s`,
      ],
    },
    {
      name: 'Rollback a deployment using id or url',
      value: `${packageName} rollback <deployment id/url>`,
    },
  ],
};
