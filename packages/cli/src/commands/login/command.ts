import { Command } from '../help';
import { getPkgName } from '../../util/pkg-name';

export const loginCommand: Command = {
  name: 'login',
  description: 'Authenticate a email or team.',
  arguments: [
    {
      name: 'email or team',
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
      value: `${getPkgName()} login`,
    },
    {
      name: 'Log in using a specific email address',
      value: `${getPkgName()} login username@example.com`,
    },
    {
      name: 'Log in using a specific team "slug" for SAML Single Sign-On',
      value: `${getPkgName()} login acme`,
    },
    {
      name: 'Log in using GitHub in "out-of-band" mode',
      value: `${getPkgName()} login --github --oob`,
    },
  ],
};
