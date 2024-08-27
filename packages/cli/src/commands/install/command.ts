import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const installCommand: Command = {
  name: 'install',
  description: 'Show information about a deployment.',
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
