import type { Command } from '../help';
import { packageName } from '../../util/pkg-name';
import { addSubcommand } from '../integration/command';

export const installCommand: Command = {
  name: 'install',
  aliases: ['i'],
  description:
    'Install an integration from the marketplace (alias for `integration add`)',
  arguments: [
    {
      name: 'integration',
      required: true,
    },
  ],
  options: addSubcommand.options,
  examples: [
    {
      name: 'Install an integration from the marketplace',
      value: `${packageName} install acme`,
    },
    {
      name: 'Install a specific product',
      value: `${packageName} install acme/acme-redis`,
    },
  ],
};
