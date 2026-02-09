import { packageName } from '../../util/pkg-name';
import { confirmOption, formatOption, yesOption } from '../../util/arg-common';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List linked Vercel projects in the current directory',
  arguments: [],
  options: [formatOption],
  examples: [
    {
      name: 'List all linked projects',
      value: `${packageName} link ls`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} link ls --format json`,
    },
  ],
} as const;

export const linkCommand = {
  name: 'link',
  aliases: [],
  description: 'Link a local directory to a Vercel Project.',
  arguments: [],
  subcommands: [listSubcommand],
  options: [
    {
      name: 'repo',
      description: 'Link multiple projects based on Git repository (alpha)',
      shorthand: 'r',
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'project',
      description: 'Specify a project name',
      shorthand: 'p',
      argument: 'NAME',
      type: String,
      deprecated: false,
    },
    {
      ...yesOption,
      description:
        'Skip questions when setting up new project using default scope and settings',
    },
    confirmOption,
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
} as const;
