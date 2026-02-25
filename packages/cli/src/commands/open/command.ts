import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const openCommand = {
  name: 'open',
  aliases: [],
  description: 'Opens the current project in the Vercel Dashboard.',
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
      name: 'Open the current project in the Vercel Dashboard',
      value: `${packageName} open`,
    },
  ],
} as const;
