import { packageName } from '../../util/pkg-name';

export const openCommand = {
  name: 'open',
  description: 'Opens the dashboard in the current project you are in.',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Opens a tab in your browser in the overview page for the project you are in',
      value: `${packageName} open`,
    },
  ],
} as const;
