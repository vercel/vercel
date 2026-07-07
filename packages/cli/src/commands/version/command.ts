import { packageName } from '../../util/pkg-name';

// Private/undocumented while the managed store is experimental.
export const versionCommand = {
  name: 'version',
  aliases: [],
  hidden: true,
  description: 'Manage the CLI version via the managed store.',
  arguments: [],
  subcommands: [
    {
      name: 'pin',
      aliases: [],
      description:
        'Pin the CLI to a version (semver or tarball URL), or track "latest"',
      arguments: [{ name: 'specifier', required: true }],
      options: [],
      examples: [],
    },
    {
      name: 'unpin',
      aliases: [],
      description: 'Remove the pin and resume tracking the newest version',
      arguments: [],
      options: [],
      examples: [],
    },
    {
      name: 'list',
      aliases: ['ls'],
      description: 'List versions in the managed store',
      arguments: [],
      options: [],
      examples: [],
    },
    {
      name: 'reset',
      aliases: [],
      description: 'Remove the managed store entirely',
      arguments: [],
      options: [],
      examples: [],
    },
  ],
  options: [
    {
      name: 'experimental',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'binary',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Show version and managed store status',
      value: `${packageName} version`,
    },
  ],
} as const;
