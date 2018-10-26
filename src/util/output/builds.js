import table from 'text-table';
import chalk from 'chalk';
import title from 'title';
import {isReady, isFailed} from '../build-state';
import strlen from '../strlen';

const prepareState = state => title(state.replace('_', ' '));

// That's how long the word "Initializing" is
const longestState = 12;

module.exports = (list, times, inspecting) => {
  const final = table(
    [
      ...list.map(build => {
        const { entrypoint, readyState, id } = build;
        const state = prepareState(readyState).padEnd(inspecting ? 0 : longestState);
        const time = typeof times[id] === 'string' ? times[id] : '';

        let stateColor = chalk.grey;
        let pathColor = inspecting ? chalk.grey : chalk.cyan;

        if (isReady({ readyState })) {
          stateColor = item => item;
        } else if (isFailed({ readyState })) {
          stateColor = chalk.red;
          pathColor = chalk.red;
        }

        return [
          `${inspecting ? `    ` : `${chalk.grey('-')} `}${pathColor(entrypoint)}`,
          stateColor(state),
          time
        ];
      })
    ],
    {
      align: ['l', 'l', 'l', 'l'],
      hsep: ' '.repeat(3),
      stringLength: strlen
    }
  );

  return `${final}\n`;
};
