import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const redeployCommand: Command = {
  name: 'redeploy',
  description: 'Rebuild and deploy a previous deployment.',
  arguments: [
    {
      name: 'deploymentId|deploymentName',
      required: false,
    },
  ],
  options: [
    {
      name: 'no-wait',
      shorthand: null,
      description: "Don't wait for the redeploy to finish",
      type: 'boolean',
      deprecated: false,
      multi: false,
    },
  ],
  examples: [
    {
      name: 'Rebuild and deploy an existing deployment using id or url',
      value: `${packageName} redeploy my-deployment.vercel.app`,
    },
    {
      name: 'Write Deployment URL to a file',
      value: `${packageName} redeploy my-deployment.vercel.app > deployment-url.txt`,
    },
  ],
};
