import { packageName } from '../../../util/pkg-name';
// import { Command } from '../../help';

export const loginCommand = {
  name: 'login',
  aliases: [],
  description: 'Authenticate the CLI.',
  arguments: [],
  options: [
    // TODO: Drop `--future` flag
    {
      name: 'future',
      description: 'Sign in using OAuth Device Authorization.',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'scope',
      description:
        'Space-delimited list of scopes to determine token permissions.',
      shorthand: '-s',
      type: String,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Sign into the Vercel platform',
      value: `${packageName} login`,
    },
  ],
  // FIXME: Add "satisfies" support
} as const; // satisfies Command;
