import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const linkCommand: Command = {
  name: 'link',
  description: 'Link a local directory to a Vercel Project.',
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
      value: `${packageName} link`,
    },
    {
      name: 'Link current directory with default options and skip questions',
      value: `${packageName} link --yes`,
    },
    {
      name: 'Link a specific directory to a Vercel Project',
      value: `${packageName} link --cwd /path/to/project`,
    },
    {
      name: 'Link to the current Git repository, allowing for multiple Vercel Projects to be linked simultaneously (useful for monorepos)',
      value: `${packageName} link --repo`,
    },
  ],
};
