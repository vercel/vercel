import { packageName } from '../../util/pkg-name';

export const serveCommand = {
  name: 'serve',
  aliases: [],
  description: 'Serve the project.',
  arguments: [
    {
      name: 'entrypoint',
      required: false,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Serve the project',
      value: `${packageName} serve`,
    },
    {
      name: 'Serve the project with a specific entrypoint',
      value: `${packageName} serve ./src/index.ts`,
    },
  ],
} as const;
