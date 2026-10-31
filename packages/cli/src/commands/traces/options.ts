import {
  deploymentOption,
  projectOption,
  sinceOption,
  untilOption,
} from '../../util/arg-common';

export const spanQueryOptions = [
  {
    ...projectOption,
    shorthand: 'p',
    description: 'Filter spans to one project (default: all team projects)',
  },
  {
    name: 'environment',
    shorthand: 'e',
    type: String,
    argument: 'ENVIRONMENT',
    deprecated: false,
    description: 'Environment: production or preview (case-insensitive)',
  },
  {
    name: 'service',
    shorthand: null,
    type: String,
    deprecated: false,
    description: 'Filter by service name',
  },
  {
    name: 'name',
    shorthand: null,
    type: String,
    deprecated: false,
    description: 'Filter by span name',
  },
  {
    name: 'kind',
    shorthand: null,
    type: String,
    deprecated: false,
    description:
      'Filter by span kind: unspecified (0), internal (1), server (2), client (3), producer (4), consumer (5)',
  },
  {
    name: 'status',
    shorthand: null,
    type: String,
    deprecated: false,
    description: 'Status: error, ok, or unset (case-insensitive)',
  },
  {
    ...deploymentOption,
    description: 'Filter by deployment ID',
  },
  // `--deployment-id` is the deprecated name of `--deployment`.
  { name: 'deployment-id', shorthand: null, type: String, deprecated: true },
  {
    name: 'request-id',
    shorthand: null,
    type: String,
    deprecated: false,
    description:
      'Filter by request ID. Some IDs return 404 in traces inspect. Reuse --scope and --project. See traces inspect --help.',
  },
  {
    name: 'trace',
    shorthand: null,
    type: String,
    argument: 'TRACE',
    deprecated: false,
    description: 'Filter by trace ID',
  },
  // `--trace-id` is the deprecated name of `--trace`.
  { name: 'trace-id', shorthand: null, type: String, deprecated: true },
  {
    name: 'span',
    shorthand: null,
    type: String,
    argument: 'SPAN',
    deprecated: false,
    description: 'Filter by span ID',
  },
  // `--span-id` is the deprecated name of `--span`.
  { name: 'span-id', shorthand: null, type: String, deprecated: true },
  {
    name: 'root',
    shorthand: null,
    type: Boolean,
    deprecated: false,
    description: 'Show root spans only',
  },
  {
    ...sinceOption,
    description: `${sinceOption.description} (default: 1h ago)`,
  },
  untilOption,
] as const;
