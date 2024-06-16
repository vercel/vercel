import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const installCommand: Command = {
  name: 'install',
  description: 'Install a Vercel Marketplace Integration',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Add Contentful to a Vercel Project',
      value: `${packageName} install contentful`,
    },
  ],
};
