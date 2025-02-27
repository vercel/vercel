import { packageName } from '../../util/pkg-name';

export const loginCommand = {
  name: 'login',
  aliases: [],
  description: 'Authenticate using your email or team id.',
  arguments: [
    {
      name: 'email or team id',
      required: false,
    },
  ],
  options: [
    {
      name: 'github',
      description: 'Log in with GitHub',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'oob',
      description: 'Log in with "out of band" authentication',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    { name: 'gitlab', shorthand: null, type: Boolean, deprecated: false },
    { name: 'bitbucket', shorthand: null, type: Boolean, deprecated: false },
    {
      name: 'future',
      description: 'Sign in using OAuth Device Authorization',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Log into the Vercel platform',
      value: `${packageName} login`,
    },
    {
      name: 'Log in using a specific email address',
      value: `${packageName} login username@example.com`,
    },
    {
      name: 'Log in using a specific team "slug" for SAML Single Sign-On',
      value: `${packageName} login acme`,
    },
    {
      name: 'Log in using GitHub in "out-of-band" mode',
      value: `${packageName} login --github --oob`,
    },
  ],
} as const;
