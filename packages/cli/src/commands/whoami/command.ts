import { packageName } from '../../util/pkg-name';
import { formatOption } from '../../util/arg-common';

export const whoamiCommand = {
  name: 'whoami',
  aliases: [],
  description: 'Shows the current user, active scope, and effective plan.',
  arguments: [],
  options: [formatOption],
  examples: [
    {
      name: 'Show the current user and effective scope plan',
      value: `${packageName} whoami`,
    },
  ],
} as const;
