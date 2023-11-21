import { Command } from '../help.js';
import { packageName } from '../../util/pkg-name.js';

export const logoutCommand: Command = {
  name: 'logout',
  description: 'Logout the current authenticated user.',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Logout from the CLI',
      value: `${packageName} logout`,
    },
  ],
};
