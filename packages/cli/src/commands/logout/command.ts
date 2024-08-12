import { packageName } from '../../util/pkg-name';

export const logoutCommand = {
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
} as const;
