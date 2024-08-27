import { Command } from '../help';

export const integrationCommand: Command = {
  name: 'integration',
  description: 'Manage integrations',
  options: [],
  examples: [],
  arguments: [
    {
      name: 'command',
      required: true,
    },
  ],
  subcommands: [
    {
      name: 'add',
      description: 'Installs an integration',
      arguments: [
        {
          name: 'name',
          required: true,
        },
      ],
      options: [],
      examples: [],
    },
  ],
};
