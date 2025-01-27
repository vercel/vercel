import { packageName } from '../../util/pkg-name';
import { limitOption, nextOption, yesOption } from '../../util/arg-common';

export const setSubcommand = {
  name: 'set',
  aliases: [],
  description: 'Create a new alias',
  default: true,
  arguments: [
    {
      name: 'deployment',
      required: true,
    },
    {
      name: 'alias',
      required: true,
    },
  ],
  options: [],
  examples: [],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'Show all aliases',
  arguments: [],
  options: [limitOption, nextOption],
  examples: [],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove an alias using its hostname',
  arguments: [
    {
      name: 'alias',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when removing an alias',
    },
  ],
  examples: [],
} as const;

export const aliasCommand = {
  name: 'alias',
  aliases: ['aliases', 'ln'],
  description: 'Interact with deployment aliases',
  arguments: [],
  subcommands: [listSubcommand, removeSubcommand, setSubcommand],
  options: [],
  examples: [
    {
      name: 'Add a new alias to `my-api.vercel.app`',
      value: `${packageName} alias set api-ownv3nc9f8.vercel.app my-api.vercel.app`,
    },
    {
      name: 'Custom domains work as alias targets',
      value: `${packageName} alias set api-ownv3nc9f8.vercel.app my-api.com`,
    },
    {
      name: 'The subcommand `set` is the default and can be skipped. Protocols in the URLs are unneeded and ignored',
      value: `${packageName} alias api-ownv3nc9f8.vercel.app my-api.com`,
    },
  ],
} as const;
