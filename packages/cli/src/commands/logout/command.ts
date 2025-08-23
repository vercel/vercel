import { packageName } from '../../util/pkg-name';

export const logoutCommand = {
  name: 'logout',
  aliases: [],
  description: 'Sign out the currently authenticated user.',
  arguments: [],
  options: [
    {
      name: 'future',
      description: 'Sign out by calling the Vercel OAuth Revocation Endpoint.',
      shorthand: null,
      type: Boolean,
      deprecated: true,
    },
  ],
  examples: [
    {
      name: 'Sign out the currently authenticated user.',
      value: `${packageName} logout`,
    },
  ],
} as const;
