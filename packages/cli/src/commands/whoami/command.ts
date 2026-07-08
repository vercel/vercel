import { packageName } from '../../util/pkg-name';
import { outputFormatOptions } from '../../util/arg-common';

export const whoamiCommand = {
  name: 'whoami',
  aliases: [],
  description: 'Shows the username of the currently logged in user.',
  arguments: [],
  outputFormats: ['json'],
  options: [...outputFormatOptions(['json'])],
  examples: [
    {
      name: 'Shows the username of the currently logged in user',
      value: `${packageName} whoami`,
    },
    {
      name: 'Print the current user as JSON',
      value: `${packageName} whoami --json`,
    },
  ],
} as const;
