import { packageName } from '../../util/pkg-name';
import { formatOption, jsonOption } from '../../util/arg-common';

export const whoamiCommand = {
  name: 'whoami',
  aliases: [],
  description: 'Shows the username of the currently logged in user.',
  arguments: [],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Shows the username of the currently logged in user',
      value: `${packageName} whoami`,
    },
  ],
} as const;
