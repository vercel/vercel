import { packageName } from '../../util/pkg-name';
import { environmentOption, targetOption } from '../../util/arg-common';

export const redeployCommand = {
  name: 'redeploy',
  aliases: [],
  description: 'Rebuild and deploy a previous deployment.',
  arguments: [
    {
      name: 'deployment',
      required: true,
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
      ...environmentOption,
      description:
        "Environment to redeploy to: production, preview, or a custom environment (default: the original deployment's environment)",
    },
    targetOption,
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
      name: 'Rebuild and deploy an existing deployment to a specific environment',
      value: `${packageName} redeploy my-deployment.vercel.app --environment preview`,
    },
  ],
} as const;
