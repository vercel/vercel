import { packageName } from '../../util/pkg-name';
import { forceOption } from '../../util/arg-common';

export const initCommand = {
  name: 'init',
  aliases: [],
  description: 'Initialize example Vercel Projects',
  arguments: [
    {
      name: 'example',
      required: false,
    },
    {
      name: 'dir',
      required: false,
    },
  ],
  options: [
    {
      ...forceOption,
      description: 'Overwrite destination directory if exists [off]',
      argument: undefined,
    },
  ],
  examples: [
    {
      name: 'Choose from all available examples',
      value: `${packageName} init`,
    },
    {
      name: 'Initialize example project into a new directory',
      value: `${packageName} init <example>`,
    },
    {
      name: 'Initialize example project into specified directory',
      value: `${packageName} <example> <dir>`,
    },
    {
      name: 'Initialize example project without checking',
      value: `${packageName} init <example> --force`,
    },
  ],
} as const;
