import { Command } from '../help.js';
import { packageName } from '../../util/pkg-name.js';

export const whoamiCommand: Command = {
  name: 'whoami',
  description: 'Shows the username of the currently logged in user.',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Shows the username of the currently logged in user',
      value: `${packageName} whoami`,
    },
  ],
};
