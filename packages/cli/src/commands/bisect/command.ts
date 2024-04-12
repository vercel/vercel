import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

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
      type: String,
      deprecated: false,
    },
    {
      name: 'good',
      description: 'Known good URL',
      argument: 'URL',
      shorthand: 'g',
      type: String,
      deprecated: false,
    },
    {
      name: 'open',
      description: 'Automatically open each URL in the browser',
      argument: 'URL',
      shorthand: 'o',
      type: String,
      deprecated: false,
    },
    {
      name: 'path',
      description: 'Subpath of the deployment URL to test',
      argument: 'URL',
      shorthand: 'p',
      type: String,
      deprecated: false,
    },
    {
      name: 'run',
      description: 'Test script to run for each deployment',
      argument: 'URL',
      shorthand: 'r',
      type: String,
      deprecated: false,
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
