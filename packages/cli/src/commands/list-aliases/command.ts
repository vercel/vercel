import { packageName } from '../../util/pkg-name';

export const listAliasesCommand = {
  name: 'list-aliases',
  aliases: ['la'],
  description: 'List all available commands and their aliases.',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'List all command aliases',
      value: `${packageName} list-aliases`,
    },
  ],
} as const;
