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
    {
      name: 'tag',
      description: 'Tag to purge',
      shorthand: null,
      type: String,
      argument: 'TAG',
      deprecated: false,
    },
    {
      name: 'stale-while-revalidate',
      description: 'Serve stale while revalidating in the background',
      shorthand: null,
      type: String,
      argument: 'SWR',
      deprecated: false,
    },
    {
      name: 'stale-if-error',
      description: 'Serve stale if revalidation fails',
      shorthand: null,
      type: String,
      argument: 'SIE',
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
    {
      name: 'Purge only a specific tag, "my-post"',
      value: `${packageName} cache purge --tag my-post`,
    },
    {
      name: 'Purge multiple tags, "my-post" and "my-blog"',
      value: `${packageName} cache purge --tag my-post,my-blog`,
    },
    {
      name: 'Purge tag "my-post" causing the next request to serve stale and revalidate in the background',
      value: `${packageName} cache purge --tag my-post --stale-while-revalidate true --stale-if-error true`,
    },
    {
      name: 'Purge tag "my-post" causing the next request to serve stale and revalidate in the background for a specific amount of seconds',
      value: `${packageName} cache purge --tag my-post --stale-while-revalidate 604800 --stale-if-error 604800`,
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
