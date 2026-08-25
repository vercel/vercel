import { packageName } from '../../util/pkg-name';

export const loginCommand = {
  name: 'login',
  aliases: [],
  description: 'Sign in to your Vercel account.',
  arguments: [
    {
      name: 'email or team id',
      required: false,
    },
  ],
  options: [
    {
      name: 'no-browser',
      description: 'Print the device login URL without opening a browser',
      shorthand: null,
      type: Boolean,
    },
    {
      name: 'github',
      description: 'Log in with GitHub',
      shorthand: null,
      type: Boolean,
      deprecated: true,
    },
    {
      name: 'oob',
      description: 'Log in with "out of band" authentication',
      shorthand: null,
      type: Boolean,
      deprecated: true,
    },
    { name: 'gitlab', shorthand: null, type: Boolean, deprecated: true },
    { name: 'bitbucket', shorthand: null, type: Boolean, deprecated: true },
    {
      name: 'future',
      description: 'Sign in using OAuth Device Authorization',
      shorthand: null,
      type: Boolean,
      deprecated: true,
    },
  ],
  examples: [
    {
      name: 'Sign in to your Vercel account.',
      value: `${packageName} login`,
    },
    {
      name: 'Sign in from a remote machine.',
      value: `${packageName} login --no-browser`,
    },
  ],
  disabledGlobalOptions: ['token'],
} as const;
