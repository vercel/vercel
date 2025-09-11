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

export const invalidateSubcommand = {
  name: 'invalidate',
  aliases: [],
  description: 'Invalidate all cached content by tag',
  arguments: [],
  options: [
    yesOption,
    {
      name: 'tag',
      description: 'Tags to invalidate (comma-separated)',
      shorthand: null,
      type: String,
      argument: 'TAGS',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Invalidate all cached content associated with a tag',
      value: `${packageName} cache invalidate --tag foo`,
    },
    {
      name: 'Invalidate all cached content associated with any one of multiple tags',
      value: `${packageName} cache invalidate --tag foo,bar,baz`,
    },
  ],
} as const;

export const dangerouslyDeleteSubcommand = {
  name: 'dangerously-delete',
  aliases: [],
  description: 'Dangerously delete all cached content by tag',
  arguments: [],
  options: [
    yesOption,
    {
      name: 'tag',
      description: 'Tags to delete (comma-separated)',
      shorthand: null,
      type: String,
      argument: 'TAGS',
      deprecated: false,
    },
    {
      name: 'revalidation-deadline-seconds',
      description: 'Revalidation deadline in seconds',
      shorthand: null,
      type: Number,
      argument: 'REVALIDATION-DEADLINE-SECONDS',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Dangerously delete all cached content associated with a tag',
      value: `${packageName} cache dangerously-delete --tag foo`,
    },
    {
      name: 'Dangerously delete all cached content associated with a tag if not accessed in the next hour',
      value: `${packageName} cache dangerously-delete --tag foo --revalidation-deadline-seconds 3600`,
    },
  ],
} as const;

export const cacheCommand = {
  name: 'cache',
  aliases: [],
  description: 'Manage cache for a Project',
  arguments: [],
  subcommands: [
    purgeSubcommand,
    invalidateSubcommand,
    dangerouslyDeleteSubcommand,
  ],
  options: [],
  examples: [],
} as const;
