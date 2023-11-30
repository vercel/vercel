import { Command } from '../help';
// import { packageName } from '../../util/pkg-name';

export const promoteCommand: Command = {
  name: 'upgrade',
  description: `Upgrade the project's use of the given runtime to the latest version.`,
  arguments: [
    {
      name: 'runtime',
      required: true,
    },
  ],
  options: [],
  examples: [
  ],
};
