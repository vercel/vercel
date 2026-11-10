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
      deprecatedShorthand: 'f',
      description: 'Overwrite destination directory if exists (default: off)',
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
      placeholders: ['<example>'],
      value: `${packageName} init <example>`,
    },
    {
      name: 'Initialize example project into specified directory',
      placeholders: ['<example>', '<dir>'],
      value: `${packageName} init <example> <dir>`,
    },
    {
      name: 'Initialize example project without checking',
      placeholders: ['<example>'],
      value: `${packageName} init <example> --force`,
    },
  ],
} as const;
