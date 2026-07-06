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
      name: 'enable-auto',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Enable automatic CLI updates for future releases',
    },
    {
      name: 'disable-auto',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Disable automatic CLI updates',
    },
    // Experimental managed-store flags — intentionally undocumented for now
    // (no description = filtered out of help output).
    {
      name: 'experimental',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'stable',
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
    {
      name: 'no-binary',
      shorthand: null,
      type: Boolean,
      deprecated: false,
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
      name: 'Enable automatic CLI updates',
      value: `${packageName} upgrade --enable-auto`,
    },
    {
      name: 'Get upgrade information as JSON',
      value: `${packageName} upgrade --format=json`,
    },
  ],
} as const;
