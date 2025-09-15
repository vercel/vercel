import { packageName } from '../../util/pkg-name';

export const logoutCommand = {
  name: 'logout',
  aliases: [],
  description: 'Sign out the currently authenticated user.',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Sign out the currently authenticated user.',
      value: `${packageName} logout`,
    },
  ],
} as const;
