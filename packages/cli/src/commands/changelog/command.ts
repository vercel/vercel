import { packageName } from '../../util/pkg-name';
import { formatOption, jsonOption } from '../../util/arg-common';

const changelogOptions = [
  {
    name: 'limit',
    shorthand: null,
    type: Number,
    argument: 'NUMBER',
    deprecated: false,
    description: 'Number of updates to show (default: 5, max: 20)',
  },
  formatOption,
  jsonOption,
] as const;

export const searchSubcommand = {
  name: 'search',
  aliases: [],
  description: 'Search Vercel product updates by keyword',
  arguments: [
    {
      name: 'query',
      required: true,
      multiple: true,
    },
  ],
  options: changelogOptions,
  examples: [
    {
      name: 'Search Vercel product updates',
      value: `${packageName} changelog search "Fluid compute"`,
    },
  ],
} as const;

export const changelogCommand = {
  name: 'changelog',
  aliases: [],
  description: 'Show the latest Vercel product updates',
  arguments: [],
  subcommands: [searchSubcommand],
  options: changelogOptions,
  examples: [
    {
      name: 'Show the 5 latest Vercel product updates',
      value: `${packageName} --changelog`,
    },
    {
      name: 'Show more Vercel product updates',
      value: `${packageName} changelog --limit 10`,
    },
    {
      name: 'Search Vercel product updates',
      value: `${packageName} changelog search "AI SDK"`,
    },
  ],
} as const;
