import { packageName } from '../../util/pkg-name';

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create a new Vercel account',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Create a new account',
      value: `${packageName} account create`,
    },
  ],
} as const;

export const accountCommand = {
  name: 'account',
  aliases: ['accounts'],
  description: 'Manage your Vercel account',
  arguments: [],
  subcommands: [createSubcommand],
  options: [],
  examples: [],
} as const;
