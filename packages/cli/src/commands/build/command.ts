import { Command } from '../help';
import { getPkgName } from '../../util/pkg-name';

export const buildCommand: Command = {
  name: 'build',
  description: 'Build the project.',
  arguments: [],
  options: [
    {
      name: 'prod',
      description: 'Build a production deployment',
      shorthand: null,
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'output',
      description: 'Directory where built assets should be written to',
      shorthand: null,
      argument: 'PATH',
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'yes',
      description:
        'Skip the confirmation prompt about pulling environment variables and project settings when not found locally',
      shorthand: 'y',
      type: 'boolean',
      deprecated: false,
      multi: false,
    },
  ],
  examples: [
    {
      name: 'Build the project',
      value: `${getPkgName()} build`,
    },
    {
      name: 'Build the project in a specific directory',
      value: `${getPkgName()} build --cwd ./path-to-project`,
    },
  ],
};
