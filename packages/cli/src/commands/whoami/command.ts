import { packageName } from '../../util/pkg-name';
import { formatOption } from '../../util/arg-common';

export const whoamiCommand = {
  name: 'whoami',
  aliases: [],
  description:
    'Shows the currently logged in user, active scope, and effective plan.',
  arguments: [],
  options: [formatOption],
  examples: [
    {
      name: 'Show the current scope and effective plan',
      value: `${packageName} whoami`,
    },
  ],
} as const;
