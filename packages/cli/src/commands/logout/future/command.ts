import { packageName } from '../../../util/pkg-name';

export const logoutCommand = {
  name: 'logout',
  aliases: [],
  description: 'Logout the current authenticated user.',
  arguments: [],
  options: [
    // TODO: Drop `--future` flag
    {
      name: 'future',
      description: 'Sign out by calling the Vercel OAuth Revocation Endpoint.',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Logout from the CLI',
      value: `${packageName} logout`,
    },
  ],
} as const;
