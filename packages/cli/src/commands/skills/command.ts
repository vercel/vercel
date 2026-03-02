import { packageName } from '../../util/pkg-name';

export const skillsCommand = {
  name: 'skills',
  aliases: [],
  description: 'Discover agent skills relevant to your project',
  arguments: [{ name: 'query', required: false }],
  options: [
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output results as JSON',
    },
    {
      name: 'format',
      shorthand: null,
      type: String,
      argument: 'FORMAT',
      deprecated: false,
      description: 'Specify output format (json)',
    },
  ],
  examples: [
    {
      name: 'Recommend skills based on detected project',
      value: `${packageName} skills`,
    },
    {
      name: 'Search for skills by keyword',
      value: `${packageName} skills nextjs`,
    },
  ],
} as const;
