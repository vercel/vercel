import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const shareCommand = {
  name: 'share',
  aliases: [],
  description: 'Create a shareable link for a protected deployment.',
  arguments: [
    {
      name: 'url|deploymentId',
      required: false,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the approval prompt before creating the share link',
    },
    {
      name: 'ttl',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Optional expiry for the share link (for example: 30m, 1h, 82800)',
      argument: 'DURATION',
    },
  ],
  examples: [
    {
      name: 'Create a shareable link for a deployment URL',
      value: `${packageName} share my-deployment-abc123.vercel.app`,
    },
    {
      name: 'Create a shareable link for a deployment ID',
      value: `${packageName} share dpl_1234567890abcdef`,
    },
    {
      name: 'Create a shareable link for the current branch deployment',
      value: `${packageName} share`,
    },
    {
      name: 'Create a shareable link with a one hour TTL',
      value: `${packageName} share my-deployment-abc123.vercel.app --ttl 1h`,
    },
  ],
} as const;
