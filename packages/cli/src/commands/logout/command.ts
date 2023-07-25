import { Command } from '../help';
import { getPkgName } from '../../util/pkg-name';

export const logoutCommand: Command = {
  name: 'logout',
  description: 'Logout of the currently authenticated user or team.',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Logout from the CLI',
      value: `${getPkgName()} logout`,
    },
  ],
};
