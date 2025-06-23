import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const purgeSubcommand = {
  name: 'purge',
  aliases: [],
  description: 'Purge cache for the current project',
  arguments: [],
  options: [
    yesOption,
    {
      name: 'type',
      description: 'Type of cache to purge',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Purge all caches for the current project',
      value: `${packageName} cache purge`,
    },
    {
      name: 'Purge only the CDN cache',
      value: `${packageName} cache purge --type cdn`,
    },
    {
      name: 'Purge only the data cache',
      value: `${packageName} cache purge --type data`,
    },
  ],
} as const;

export const cacheCommand = {
  name: 'cache',
  aliases: [],
  description: 'Manage cache for a Project',
  arguments: [],
  subcommands: [purgeSubcommand],
  options: [],
  examples: [],
} as const;
