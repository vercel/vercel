import { packageName } from '../../util/pkg-name';

export const openCommand = {
  name: 'open',
  aliases: ['o'],
  description: 'Open a project in vercel.com',
  arguments: [
    {
      name: ':team/:project',
      required: false,
      multiple: false,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Open the current project',
      value: `${packageName} open`,
    },
  ],
} as const;
