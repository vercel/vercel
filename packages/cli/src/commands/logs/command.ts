import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const logsCommand: Command = {
  name: 'logs',
  description: 'Display logs for a specific deployment.',
  arguments: [
    {
      name: 'url|deploymentId',
      required: true,
    },
  ],
  options: [
    {
      name: 'follow',
      shorthand: 'f',
      description: 'Wait for additional data [off]',
      type: String,
      deprecated: false,
    },
    {
      name: 'limit',
      shorthand: 'n',
      description: 'Number of log entries [100]',
      argument: 'NUMBER',
      type: String,
      deprecated: false,
    },
    {
      name: 'since',
      shorthand: null,
      description: 'Only return logs after date (ISO 8601)',
      argument: 'SINCE',
      type: String,
      deprecated: false,
    },
    {
      name: 'until',
      shorthand: null,
      description:
        'Only return logs before date (ISO 8601), ignored when used with --follow',
      argument: 'UNTIL',
      type: String,
      deprecated: false,
    },
    {
      name: 'output',
      shorthand: 'o',
      description: `Specify the output format (short|raw) [short]`,
      argument: 'MODE',
      type: String,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Print the logs for the deployment DEPLOYMENT_ID',
      value: `${packageName} logs DEPLOYMENT_ID`,
    },
  ],
};
