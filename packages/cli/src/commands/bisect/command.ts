import { Command } from '../help.js';
import { packageName } from '../../util/pkg-name.js';

export const bisectCommand: Command = {
  name: 'bisect',
  description: 'Bisect the current project interactively.',
  arguments: [],
  options: [
    {
      name: 'bad',
      description: 'Known bad URL',
      argument: 'URL',
      shorthand: 'b',
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'good',
      description: 'Known good URL',
      argument: 'URL',
      shorthand: 'g',
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'open',
      description: 'Automatically open each URL in the browser',
      argument: 'URL',
      shorthand: 'o',
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'path',
      description: 'Subpath of the deployment URL to test',
      argument: 'URL',
      shorthand: 'p',
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'run',
      description: 'Test script to run for each deployment',
      argument: 'URL',
      shorthand: 'r',
      type: 'string',
      deprecated: false,
      multi: false,
    },
  ],
  examples: [
    {
      name: 'Bisect the current project interactively',
      value: `${packageName} bisect`,
    },
    {
      name: 'Bisect with a known bad deployment',
      value: `${packageName} bisect --bad example-310pce9i0.vercel.app`,
    },
    {
      name: 'Automated bisect with a run script',
      value: `${packageName} bisect --run ./test.sh`,
    },
  ],
};
