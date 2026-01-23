import { formatOption, jsonOption } from '../../util/arg-common';
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
      ...formatOption,
      description: 'Specify the output format (json) - implies --dry-run',
    },
    jsonOption,
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
      value: `${packageName} upgrade --format=json`,
    },
  ],
} as const;
