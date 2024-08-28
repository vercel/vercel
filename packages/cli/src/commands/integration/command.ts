import { packageName } from '../../util/pkg-name';
import { Command } from '../help';

export const integrationCommand: Command = {
  name: 'integration',
  description: 'Manage marketplace integrations',
  options: [],
  arguments: [
    {
      name: 'command',
      required: true,
    },
  ],
  subcommands: [
    {
      name: 'add',
      description: 'Installs a marketplace integration',
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
  examples: [
    {
      name: 'Install a marketplace integration',
      value: [
        `${packageName} integration add <integration-name>`,
        `${packageName} integration add acme`,
      ],
    },
  ],
};
