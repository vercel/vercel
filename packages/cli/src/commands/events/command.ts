import { packageName } from '../../util/pkg-name';
import { formatOption } from '../../util/arg-common';

export const eventsCommand = {
  name: 'events',
  aliases: [],
  description: 'Display a list of events for the current user or team.',
  arguments: [],
  options: [
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      deprecated: false,
      description: 'Maximum number of events to return (default: 25)',
    },
    {
      name: 'since',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Only include events after this time (ISO format or relative: 1h, 7d)',
    },
    {
      name: 'until',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Only include events before this time (ISO format or relative)',
    },
    {
      name: 'types',
      shorthand: null,
      type: [String],
      deprecated: false,
      description:
        'Filter by event type (repeatable, e.g. --types deployment --types login)',
    },
    {
      name: 'principal-id',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Filter events by a specific user or principal ID',
    },
    {
      name: 'project-ids',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: 'Filter events by project ID (repeatable)',
    },
    {
      name: 'with-payload',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Include the full event payload in the response',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Display recent events',
      value: `${packageName} events`,
    },
    {
      name: 'Display the last 10 events',
      value: `${packageName} events --limit 10`,
    },
    {
      name: 'Display events from the last 7 days',
      value: `${packageName} events --since 7d`,
    },
    {
      name: 'Filter events by type',
      value: `${packageName} events --types deployment`,
    },
    {
      name: 'Output events as JSON',
      value: `${packageName} events --format json`,
    },
  ],
} as const;
