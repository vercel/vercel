import { formatOption, jsonOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const contractCommand = {
  name: 'contract',
  aliases: [],
  description: 'Show contract information for all billing periods',
  arguments: [],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Show contract information for all billing periods',
      value: `${packageName} contract`,
    },
    {
      name: 'Show contract information for all billing periods as JSON',
      value: `${packageName} contract --format json`,
    },
  ],
} as const;
