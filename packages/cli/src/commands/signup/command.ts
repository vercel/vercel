import { packageName } from '../../util/pkg-name';

export const signupCommand = {
  name: 'signup',
  aliases: [],
  description: 'Create a Vercel account and sign in.',
  arguments: [],
  options: [
    {
      name: 'email',
      description: 'Email address to use when creating the account',
      argument: 'EMAIL',
      shorthand: null,
      type: String,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Create a Vercel account with an email address.',
      value: `${packageName} signup --email user@example.com`,
    },
    {
      name: 'Create a Vercel account and enter your email when prompted.',
      value: `${packageName} signup`,
    },
  ],
  disabledGlobalOptions: ['token'],
} as const;
