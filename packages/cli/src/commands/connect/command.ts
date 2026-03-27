import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const connectCommand = {
  name: 'connect',
  description:
    'Connect to a Vercel project with full network access to your infrastructure for development or debugging',
  arguments: [
    {
      name: 'dir',
      required: false,
    },
  ],
  options: [
    yesOption,
    {
      name: 'dev',
      description: 'Automatically start `vc dev` inside the devcontainer',
      type: Boolean,
      shorthand: 'd',
      deprecated: false,
    },
    {
      name: 'ide',
      description:
        'Skip exec into the devcontainer, just set up files and exit. Useful for IDE usage (VSCode, IntelliJ, etc.)',
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'listen',
      description: 'Specify a URI endpoint for the dev server [0.0.0.0:3000]',
      argument: 'URI',
      shorthand: 'l',
      type: String,
      deprecated: false,
    },
    {
      name: 'forward-domains',
      description:
        'Comma-separated list of domains to forward to the Vercel function',
      argument: 'DOMAINS',
      type: String,
      deprecated: false,
    },
    {
      name: 'bridge-version',
      description:
        'Version of bridge to install (e.g., "v1.0.0" or "edge" for latest)',
      argument: 'VERSION',
      type: String,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Connect to a Vercel project and start a devcontainer',
      value: `${packageName} connect`,
    },
    {
      name: 'Connect and automatically start the dev server',
      value: `${packageName} connect --dev`,
    },
    {
      name: 'Set up devcontainer files without starting (for IDE usage)',
      value: `${packageName} connect --ide`,
    },
  ],
} as const;
