import { packageName } from '../../util/pkg-name';

export const redeployCommand = {
  name: 'redeploy',
  aliases: [],
  description: 'Rebuild and deploy a previous deployment.',
  arguments: [
    {
      name: 'url|deploymentId',
      required: false,
    },
  ],
  options: [
    {
      name: 'no-wait',
      shorthand: null,
      description: "Don't wait for the redeploy to finish",
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'target',
      shorthand: null,
      argument: 'TARGET',
      description: 'Redeploy to a specific target environment',
      type: String,
      deprecated: false,
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
    {
      name: 'Rebuild and deploy an existing deployment to a specific target environment',
      value: `${packageName} redeploy my-deployment.vercel.app --target preview`,
    },
  ],
} as const;
