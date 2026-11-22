import { formatOption, jsonOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const upgradeCommand = {
  name: 'upgrade',
  aliases: [],
  description: 'Upgrade the current global or native Vercel CLI installation',
  arguments: [
    {
      name: 'version|latest',
      required: false,
    },
  ],
  options: [
    {
      name: 'dry-run',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Show the upgrade command without executing it',
    },
    {
      name: 'autoupdate',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Turn on automatic CLI updates for future releases',
    },
    {
      name: 'no-autoupdate',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Turn off automatic CLI updates',
    },
    {
      // Hidden: the old name of `--autoupdate`.
      name: 'enable-auto',
      shorthand: null,
      type: Boolean,
      deprecated: true,
      description: 'Deprecated alias for `--autoupdate`',
    },
    {
      // Hidden: the old name of `--no-autoupdate`.
      name: 'disable-auto',
      shorthand: null,
      type: Boolean,
      deprecated: true,
      description: 'Deprecated alias for `--no-autoupdate`',
    },
    {
      name: 'bypass-min-release-age',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Bypass package-manager release-age checks for this and future foreground upgrades',
    },
    {
      name: 'no-bypass-min-release-age',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Restore package-manager release-age checks',
    },
    {
      // Hidden: the old name of `--no-bypass-min-release-age`.
      name: 'disable-min-release-age-bypass',
      shorthand: null,
      type: Boolean,
      deprecated: true,
      description: 'Deprecated alias for `--no-bypass-min-release-age`',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Upgrade the Vercel CLI to the latest version',
      value: `${packageName} upgrade`,
    },
    {
      name: 'Install a specific Vercel CLI version',
      value: `${packageName} upgrade 59.11.7`,
    },
    {
      name: 'Install the latest version using the package manager',
      value: `${packageName} upgrade latest`,
    },
    {
      name: 'Show the upgrade command without running it',
      value: `${packageName} upgrade --dry-run`,
    },
    {
      name: 'Turn on automatic CLI updates',
      value: `${packageName} upgrade --autoupdate`,
    },
    {
      name: 'Get upgrade information as JSON',
      value: `${packageName} upgrade --json`,
    },
  ],
} as const;
