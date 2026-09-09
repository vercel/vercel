import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const deployButtonCommand = {
  name: 'deploy-button',
  aliases: [],
  description:
    'Generate a "Deploy with Vercel" button URL for the linked project.',
  arguments: [],
  options: [
    {
      ...yesOption,
      description:
        'Skip confirmation when linking is required (e.g. in non-interactive mode)',
    },
  ],
  examples: [
    {
      name: 'Generate a deploy button for the current project',
      value: `${packageName} deploy-button`,
    },
  ],
} as const;
