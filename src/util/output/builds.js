import chalk from 'chalk';
import title from 'title';
import bytes from 'bytes';
import {isReady, isFailed} from '../build-state';

const prepareState = state => title(state.replace('_', ' '));

// That's how long the word "Initializing" is
const longestState = 12;

// That's the spacing between the source, state and time
const padding = 8;

const styleBuild = (build, times, inspecting, longestSource) => {
  const {entrypoint, readyState, id, hasOutput} = build;
  const state = prepareState(readyState).padEnd(longestState + padding);
  const time = typeof times[id] === 'string' ? times[id] : '';

  let stateColor = chalk.grey;
  let pathColor = inspecting ? chalk.grey : chalk.cyan;

  if (isReady({ readyState })) {
    stateColor = item => item;
  } else if (isFailed({ readyState })) {
    stateColor = chalk.red;
    pathColor = chalk.red;
  }

  const entry = entrypoint.padEnd(longestSource + padding);
  const prefix = hasOutput ? '┌' : '╶';

  return `${inspecting ? `    ` : `${chalk.grey(prefix)} `}${pathColor(entry)}${stateColor(state)}${time}`;
};

const styleOutput = (output, inspecting) => {
  const {type, path, readyState, size, isLast, lambda} = output;
  const prefix = type === 'lambda' ? 'λ ' : '';
  const finalSize = size ? ` ${chalk.grey(`(${bytes(size)})`)}` : '';

  let color = chalk.grey;
  let finalRegion = '';

  if (isReady({ readyState })) {
    color = item => item;
  } else if (isFailed({ readyState })) {
    color = chalk.red;
  }

  if (lambda) {
    const { deployedTo } = lambda;

    if (deployedTo && deployedTo.length > 0) {
      finalRegion = ` ${chalk.grey(`[${deployedTo.join(', ')}]`)}`;
    }
  }

  const corner = isLast ? '└──' : '├──';
  const main = prefix + path + finalSize + finalRegion;

  return `${inspecting ? `      ` : `${chalk.grey(corner)} `}${color(main)}`;
};

export default (builds, times, inspecting) => {
  const buildsAndOutput = [];

  for (const build of builds) {
    buildsAndOutput.push(build);
    const {output, copiedFrom} = build;

    if (!copiedFrom && output && output.length > 0) {
      build.hasOutput = true;

      for (const item of output) {
        item.isOutput = true;
        item.readyState = build.readyState;

        if (output.indexOf(item) === output.length - 1) {
          item.isLast = true;
        }

        buildsAndOutput.push(item);
      }
    }
  }

  const longestSource = builds.reduce((final, current) => {
    const { length } = current.entrypoint;
    return length > final ? length : final;
  }, 0);

  const final = buildsAndOutput.map((item, index) => {
    let log = null;

    if (item.isOutput) {
      log = styleOutput(item, inspecting);
    } else {
      log = styleBuild(item, times, inspecting, longestSource);
    }

    const newline = (index === buildsAndOutput.length - 1) ? '' : '\n';
    return log + newline;
  });

  return {
    lines: final.length + 1,
    toPrint: `${final.join('')}\n`
  };
};
