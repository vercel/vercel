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
      name: 'copy',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Copy the deploy URL to clipboard',
    },
    {
      name: 'markdown',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output only the Markdown snippet',
    },
    {
      ...yesOption,
      description:
        'Skip confirmation when linking is required (e.g. in non-interactive mode)',
    },
  ],
  examples: [
    {
      name: 'Generate a deploy button URL for the current project',
      value: `${packageName} deploy-button`,
    },
    {
      name: 'Copy the deploy URL to clipboard',
      value: `${packageName} deploy-button --copy`,
    },
    {
      name: 'Output only the Markdown snippet',
      value: `${packageName} deploy-button --markdown`,
    },
  ],
} as const;
