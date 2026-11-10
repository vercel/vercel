import {
  formatOption,
  jsonOption,
  sinceOption,
  untilOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const usageCommand = {
  name: 'usage',
  aliases: [],
  summary: 'Show billing usage and costs',
  description:
    'Show billing usage and costs for the current billing cycle or a custom date range',
  arguments: [],
  options: [
    {
      ...sinceOption,
      description:
        'Start time: YYYY-MM-DD (midnight LA time), ISO 8601, or relative, like 7d (default: start of the current billing cycle)',
    },
    {
      ...untilOption,
      description:
        'End time: YYYY-MM-DD (end of day LA time), ISO 8601, or relative; requires --since (default: now)',
    },
    { name: 'from', shorthand: null, type: String, deprecated: true },
    { name: 'to', shorthand: null, type: String, deprecated: true },
    {
      name: 'breakdown',
      shorthand: null,
      type: String,
      argument: 'PERIOD',
      description:
        'Show usage breakdown by time period instead of aggregated totals (daily, weekly, monthly)',
      deprecated: false,
    },
    {
      name: 'group-by',
      shorthand: null,
      type: String,
      argument: 'DIMENSION',
      description:
        'Group usage by a dimension instead of aggregated totals (project, region)',
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
      value: `${packageName} usage --since 2025-01-01 --until 2025-01-31`,
    },
    {
      name: 'Show usage for the last 7 days',
      value: `${packageName} usage --since 7d`,
    },
    {
      name: 'Show daily usage breakdown',
      value: `${packageName} usage --breakdown daily`,
    },
    {
      name: 'Show weekly usage breakdown',
      value: `${packageName} usage --breakdown weekly`,
    },
    {
      name: 'Show usage grouped by project',
      value: `${packageName} usage --group-by project`,
    },
    {
      name: 'Show usage grouped by region',
      value: `${packageName} usage --group-by region`,
    },
    {
      name: 'Output usage data as JSON',
      value: `${packageName} usage --json`,
    },
  ],
} as const;
