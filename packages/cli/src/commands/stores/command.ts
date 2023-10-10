import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const storesCommand: Command = {
  name: 'stores',
  description: 'CRUD commands for stores.',
  arguments: [
    {
      name: 'command',
      required: true,
    },
  ],
  subcommands: [
    {
      name: 'create',
      description: 'Create a new store',
      arguments: [],
      options: [
        {
          name: 'type',
          description: 'Set the store type to create',
          shorthand: 't',
          type: 'string',
          deprecated: false,
          multi: false,
        },
        {
          name: 'name',
          description: 'Set the name of your new store',
          shorthand: 'n',
          type: 'string',
          deprecated: false,
          multi: false,
        },
      ],
      examples: [
        {
          name: 'Create a new store',
          value: [`${packageName} store create`],
        },
      ],
    },
    {
      name: 'list',
      description: 'List all your stores',
      arguments: [],
      options: [],
      examples: [],
    },
  ],
  options: [
    {
      name: 'yes',
      description: 'Skip the confirmation prompts',
      shorthand: 'y',
      type: 'boolean',
      deprecated: false,
      multi: false,
    },
  ],
  examples: [],
};
