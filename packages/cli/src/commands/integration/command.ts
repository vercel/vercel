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
      examples: [
        {
          name: 'Install a marketplace integration',
          value: [
            `${packageName} integration add <integration-name>`,
            `${packageName} integration add acme`,
          ],
        },
      ],
    },
    {
      name: 'list',
      description: 'Lists all resources from marketplace integrations',
      arguments: [
        {
          name: 'provider',
          required: false,
        },
      ],
      options: [
        {
          name: 'filter',
          description: 'limits the resources listed to a designated provider',
          argument: 'NAME',
          shorthand: 'f',
          type: String,
          deprecated: false,
        },
      ],
      examples: [
        {
          name: 'List all resources',
          value: [`${packageName} integrations list`],
        },
        {
          name: 'List all resources from a single integration',
          value: [
            `${packageName} integrations list --filter <integration>`,
            `${packageName} integrations list --filter acme`,
          ],
        },
      ],
    },
  ],
  examples: [],
};
