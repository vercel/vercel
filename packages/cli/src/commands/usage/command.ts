import { formatOption, jsonOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const usageCommand = {
  name: 'usage',
  aliases: [],
  description:
    'Show billing usage (MIUs and costs) for the current billing period or a custom date range',
  arguments: [],
  options: [
    {
      name: 'from',
      shorthand: null,
      type: String,
      argument: 'DATE',
      description: 'Start date (YYYY-MM-DD, interpreted as midnight LA time)',
      deprecated: false,
    },
    {
      name: 'to',
      shorthand: null,
      type: String,
      argument: 'DATE',
      description: 'End date (YYYY-MM-DD, interpreted as end of day LA time)',
      deprecated: false,
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Show usage for the current billing period',
      value: `${packageName} usage`,
    },
    {
      name: 'Show usage for a custom date range',
      value: `${packageName} usage --from 2025-01-01 --to 2025-01-31`,
    },
    {
      name: 'Output usage data as JSON',
      value: `${packageName} usage --format json`,
    },
  ],
} as const;
