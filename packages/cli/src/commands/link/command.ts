import { Command } from '../help';
import { getPkgName } from '../../util/pkg-name';

export const linkCommand: Command = {
  name: 'inspect',
  description: 'Show information about a deployment.',
  arguments: [],
  options: [
    {
      name: 'repo',
      description: 'Link multiple projects based on Git repository (alpha)',
      shorthand: 'r',
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'project',
      description: 'Specify a project name',
      shorthand: 'p',
      argument: 'NAME',
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'yes',
      description:
        'Skip questions when setting up new project using default scope and settings',
      shorthand: 'y',
      type: 'boolean',
      deprecated: false,
      multi: false,
    },
  ],
  examples: [
    {
      name: 'Link current directory to a Vercel Project',
      value: `${getPkgName()} link`,
    },
    {
      name: 'Link current directory with default options and skip questions',
      value: `${getPkgName()} link --yes`,
    },
    {
      name: 'Link a specific directory to a Vercel Project',
      value: `${getPkgName()} link --cwd /path/to/project`,
    },
    {
      name: 'Link to the current Git repository, allowing for multiple Vercel Projects to be linked simultaneously (useful for monorepos)',
      value: `${getPkgName()} link --repo`,
    },
  ],
};
