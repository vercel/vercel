import type { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const openCommand: Command = {
  name: 'open',
  description:
    'Open the dashboard of an integration from the marketplace (alias for `integration open`)',
  arguments: [
    {
      name: 'integration',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Opan the dashboard of an integration from the marketplace',
      value: `${packageName} open acme`,
    },
  ],
};
