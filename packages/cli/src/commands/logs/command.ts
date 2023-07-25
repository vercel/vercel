import { Command } from '../help';
import { getPkgName } from '../../util/pkg-name';

export const logsCommand: Command = {
  name: 'logs',
  description: 'Print vercel logs for a deployment.',
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
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'limit',
      shorthand: 'n',
      description: 'Number of log entries [100]',
      argument: 'NUMBER',
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'since',
      shorthand: null,
      description: 'Only return logs after date (ISO 8601)',
      argument: 'SINCE',
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'until',
      shorthand: null,
      description:
        'Only return logs before date (ISO 8601), ignored when used with --follow',
      argument: 'UNTIL',
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'output',
      shorthand: 'o',
      description: `Specify the output format (short|raw) [short]`,
      argument: 'MODE',
      type: 'string',
      deprecated: false,
      multi: false,
    },
  ],
  examples: [
    {
      name: 'Print the logs for the deployment DEPLOYMENT_ID',
      value: `${getPkgName()} logs DEPLOYMENT_ID`,
    },
  ],
};
