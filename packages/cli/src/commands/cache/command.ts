import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const purgeSubcommand = {
  name: 'purge',
  aliases: [],
  description: 'Purge the CDN cache for the current project',
  arguments: [],
  options: [yesOption],
  examples: [
    {
      name: 'Purge the CDN cache for the current project',
      value: `${packageName} cache purge`,
    },
  ],
} as const;

export const cacheCommand = {
  name: 'cache',
  aliases: [],
  description: 'Manage CND cache for a Project',
  arguments: [],
  subcommands: [purgeSubcommand],
  options: [],
  examples: [],
} as const;
