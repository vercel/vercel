import { packageName } from '../../util/pkg-name';

export const openCommand = {
  name: 'open',
  aliases: [],
  description: 'Opens the current project in the Vercel Dashboard.',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Open the current project in the Vercel Dashboard',
      value: `${packageName} open`,
    },
  ],
} as const;
