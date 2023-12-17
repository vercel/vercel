import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const initCommand: Command = {
  name: 'init',
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
  subcommands: undefined,
  options: [
    {
      name: 'force',
      description: 'Overwrite destination directory if exists [off]',
      argument: undefined,
      shorthand: 'f',
      type: 'boolean',
      deprecated: false,
      multi: false,
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
};
