import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const loginCommand: Command = {
  name: 'login',
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
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'oob',
      description: 'Log in with "out of band" authentication',
      shorthand: null,
      type: 'string',
      deprecated: false,
      multi: false,
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
};
