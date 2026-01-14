import { packageName } from '../../util/pkg-name';

export const upgradeCommand = {
  name: 'upgrade',
  aliases: [],
  description: 'Upgrades the Vercel CLI to the latest version.',
  arguments: [],
  options: [
    {
      name: 'dry-run',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Show the upgrade command without executing it',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output the upgrade information as JSON (implies --dry-run)',
    },
  ],
  examples: [
    {
      name: 'Upgrade the Vercel CLI to the latest version',
      value: `${packageName} upgrade`,
    },
    {
      name: 'Show the upgrade command without running it',
      value: `${packageName} upgrade --dry-run`,
    },
    {
      name: 'Get upgrade information as JSON',
      value: `${packageName} upgrade --json`,
    },
  ],
} as const;
