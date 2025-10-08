import { packageName } from '../../util/pkg-name';

export const whoamiCommand = {
  name: 'whoami',
  aliases: [],
  description: 'Shows the username of the currently logged in user.',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Shows the username of the currently logged in user',
      value: `${packageName} whoami`,
    },
  ],
} as const;
