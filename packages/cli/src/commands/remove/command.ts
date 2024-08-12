import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const removeCommand = {
  name: 'remove',
  description: 'Remove a deployment by name or id.',
  arguments: [
    {
      name: '...deploymentId|deploymentName',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip confirmation',
    },
    {
      name: 'safe',
      shorthand: 's',
      type: Boolean,
      deprecated: false,
      description: 'Skip deployments with an active alias',
    },
    { name: 'hard', shorthand: null, type: Boolean, deprecated: false },
  ],
  examples: [
    {
      name: 'Remove a deployment identified by `deploymentId`',
      value: `${packageName} remove my-app`,
    },
    {
      name: 'Remove all deployments with name `my-app`',
      value: `${packageName} remove deploymentId`,
    },
    {
      name: 'Remove two deployments with IDs `eyWt6zuSdeus` and `uWHoA9RQ1d1o`',
      value: `${packageName} remove eyWt6zuSdeus uWHoA9RQ1d1o`,
    },
  ],
} as const;
