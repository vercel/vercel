import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const inspectCommand: Command = {
  name: 'inspect',
  description: 'Show information about a deployment.',
  arguments: [
    {
      name: 'url',
      required: true,
    },
  ],
  options: [
    {
      name: 'timeout',
      description: 'Time to wait for deployment completion [3m]',
      argument: 'TIME',
      shorthand: null,
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'wait',
      description: 'Blocks until deployment completes',
      shorthand: null,
      type: 'string',
      deprecated: false,
      multi: false,
    },
  ],
  examples: [
    {
      name: 'Get information about a deployment by its unique URL',
      value: `${packageName} inspect my-deployment-ji2fjij2.vercel.app`,
    },
    {
      name: 'Get information about the deployment an alias points to',
      value: `${packageName} inspect my-deployment.vercel.app`,
    },
    {
      name: 'Get information about a deployment by piping in the URL',
      value: `echo my-deployment.vercel.app | ${packageName} inspect`,
    },
    {
      name: 'Wait up to 90 seconds for deployment to complete',
      value: `${packageName} inspect my-deployment.vercel.app --wait --timeout 90s`,
    },
  ],
};
