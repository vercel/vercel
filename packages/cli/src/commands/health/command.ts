import { packageName } from '../../util/pkg-name';
import { jsonOption } from '../../util/arg-common';

export const healthCommand = {
  name: 'health',
  aliases: ['status-page'],
  description: 'Show the current Vercel platform status and recent incidents',
  arguments: [],
  options: [jsonOption],
  examples: [
    {
      name: 'Show the current Vercel platform status',
      value: `${packageName} health`,
    },
    {
      name: 'Read the status and incidents as JSON',
      value: `${packageName} health --json`,
    },
    {
      name: 'List the names of active incidents',
      value: `${packageName} health --json | jq -r '.incidents[] | select(.resolvedAt == null) | .name'`,
    },
  ],
  helpSections: [
    {
      title: 'Notes',
      body: [
        'Reads the public status page at https://www.vercel-status.com.',
        'No login or linked project is needed.',
        'Shows degraded components, active incidents, scheduled maintenance, and incidents resolved in the last 7 days.',
        'With --json, components lists every component, and incidents lists active and recently resolved incidents, newest first.',
      ],
    },
  ],
} as const;
