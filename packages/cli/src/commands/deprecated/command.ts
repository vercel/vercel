import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const deprecatedCommand: Command = {
  name: 'deprecated',
  description: ``,
  arguments: [],
  subcommands: [
    {
      name: 'ls',
      description: 'List projects affected by a current deprecation.',
      arguments: [],
      options: [],
      examples: []
    }
  ],
  options: [],
  examples: [
    {
      name: `List projects affected by a current deprecation.`,
      value: `${packageName} deprecated ls`,
    },
  ],
};
