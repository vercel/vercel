import table from 'text-table';
import chalk from 'chalk';
import title from 'title';
import {isReady, isFailed} from '../build-state';
import strlen from '../strlen';

const prepareState = state => title(state.replace('_', ' '));

// That's how long the word "Initializing" is
const longestState = 12;

const styleBuild = (build, times, inspecting) => {
  const {entrypoint, readyState, id} = build;
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
};

const styleOutput = (output, inspecting) => {
  const {path} = output;
  let pathColor = inspecting ? chalk.grey : chalk.grey;

  return [
    `${inspecting ? `    ` : `  ${chalk.grey('-')} `}${pathColor(path)}`
  ];
};

module.exports = (builds, times, inspecting) => {
  const buildsAndOutput = [];

  for (const build of builds) {
    buildsAndOutput.push(build);
    const {output} = build;

    if (output && output.length > 0) {
      for (const item of output) {
        item.isOutput = true;
        buildsAndOutput.push(item);
      }
    }
  }

  const input = buildsAndOutput.map(item => {
    if (item.isOutput) {
      return styleOutput(item, inspecting);
    }

    return styleBuild(item, times, inspecting);
  });

  const final = table(input, {
    align: ['l', 'l', 'l', 'l'],
    hsep: ' '.repeat(3),
    stringLength: strlen
  });

  return {
    lines: input.length + 1,
    toPrint: `${final}\n`
  };
};
