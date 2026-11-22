import { packageName } from '../../util/pkg-name';
import { formatOption, jsonOption } from '../../util/arg-common';

export const whoamiCommand = {
  name: 'whoami',
  aliases: [],
  description: 'Shows the username of the currently logged in user.',
  arguments: [],
  options: [
    formatOption,
    jsonOption,
    {
      name: 'cached',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Print the username saved by the last check, without contacting Vercel. It can be out of date.',
    },
  ],
  examples: [
    {
      name: 'Shows the username of the currently logged in user',
      value: `${packageName} whoami`,
    },
    {
      name: 'Print the saved username without a network request',
      value: `${packageName} whoami --cached`,
    },
  ],
} as const;
