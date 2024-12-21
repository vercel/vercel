import type { Command } from '../help';
import { packageName } from '../../util/pkg-name';

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
  options: [],
  examples: [
    {
      name: 'Install an integration from the marketplace',
      value: `${packageName} install acme`,
    },
  ],
};
