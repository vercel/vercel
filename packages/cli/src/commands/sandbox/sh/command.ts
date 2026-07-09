import { packageName } from '../../../util/pkg-name';
import { createSubcommand } from '../create/command';

// `sh` == `create` with an interactive shell forced on, so it exposes every
// create flag except `--connect` (which is always on here).
const optionsWithoutConnect = createSubcommand.options.filter(
  option => option.name !== 'connect'
);

export const shSubcommand = {
  name: 'sh',
  aliases: [],
  description: 'Create a sandbox and start an interactive shell',
  arguments: [],
  options: optionsWithoutConnect,
  examples: [
    {
      name: 'Create a sandbox and open an interactive shell',
      value: `${packageName} sandbox sh`,
    },
    {
      name: 'Open a shell in a sandbox with no network access',
      value: `${packageName} sandbox sh --network-policy=deny-all`,
    },
  ],
} as const;
