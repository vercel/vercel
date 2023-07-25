import { Command } from '../help';
import { getPkgName } from '../../util/pkg-name';

export const whoamiCommand: Command = {
  name: 'whoami',
  description: 'Shows the username of the currently logged in user',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Shows the username of the currently logged in user',
      value: `${getPkgName()} whoami`,
    },
  ],
};
