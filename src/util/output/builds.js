import chalk from 'chalk';
import title from 'title';
import bytes from 'bytes';
import { parse as parsePath } from 'path';
import { isReady, isFailed } from '../build-state';

// That's how long the word "Initializing" is
const longestState = 12;

// That's the spacing between the source, state and time
const padding = 8;

// That's the max numbers of builds and outputs that will be displayed
const MAX_BUILD_GROUPS = 5;
// TODO - const MAX_OUTPUTS_PER_GROUP = 5;

const prepareState = state => title(state.replace('_', ' '));

// Check if two paths can be groupd together
const canGroup = (path1, path2, level) => {
  const group1 = parsePath(path1).dir.split("/");
  const group2 = parsePath(path2).dir.split("/");

  const shortGroup = group1.length > group2.length ? group2 : group1;
  const longGroup = group1.length > group2.length ? group1 : group2;

  // If the length differs on level 0 they should not be grouped
  if (level === 0 && shortGroup.length !== longGroup.length) {
    return false;
  }

  // Remove the "level" from the shorter path
  const longPath = longGroup.join("/");
  const shortPath = shortGroup.slice(0, level ? -level : undefined).join("/");

  // Since /^/ will just match everything we need to
  // make this one manually
  if (shortPath === "" && longPath !== "") {
    return false;
  }

  return new RegExp(`^${shortPath}`).test(longPath);
};

// Group two builds together
const groupPaths = (groups, level = 0) => {
  let nextGroups = [];
  let hasChange = false;

  for (let i = 0; i < groups.length; i++) {
    if (!groups[i + 1]) {
      nextGroups.push(groups[i]);
      continue;
    }

    const prev = groups[i][0].entrypoint;
    const next = groups[i + 1][0].entrypoint;

    if (canGroup(prev, next, level)) {
      hasChange = true;
      nextGroups.push(groups[i].concat(groups[i + 1]));
      nextGroups = nextGroups.concat(groups.slice(i + 2));
      break;
    } else {
      nextGroups.push(groups[i]);
    }
  }

  // Sort the groups, otherwise there might be
  // some groups with different paths which
  // would actually better fit into the "next" group
  nextGroups = nextGroups.sort((a, b) => {
    if (a[0].path > b[0].path) {
      return -1;
    }

    if (b[0].path > a[0].path) {
      return 1;
    }

    return 0;
  });

  if (hasChange === false) {
    return groupPaths(nextGroups, level + 1);
  }

  return nextGroups;
};

const styleBuild = (build, times, longestSource) => {
  const { entrypoint, readyState, id, hasOutput } = build;
  const state = prepareState(readyState).padEnd(longestState + padding);
  const time = typeof times[id] === 'string' ? times[id] : '';

  let stateColor = chalk.grey;
  let pathColor = chalk.cyan;

  if (isReady({ readyState })) {
    stateColor = item => item;
  } else if (isFailed({ readyState })) {
    stateColor = chalk.red;
    pathColor = chalk.red;
  }

  const entry = entrypoint.padEnd(longestSource + padding);
  const prefix = hasOutput ? '┌' : '╶';

  return `${chalk.grey(prefix)} ${pathColor(
    entry
  )}${stateColor(state)}${time}`;
};

const styleOutput = (output) => {
  const { type, path, readyState, size, isLast, lambda } = output;
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

  return `${chalk.grey(corner)} ${color(main)}`;
};

export default (builds, times) => {
  // Sort the builds by path
  // so that the grouping will be easier
  let path = builds
    .sort((a, b) => {
      if (a.entrypoint > b.entrypoint) {
        return 1;
      }

      if (b.entrypoint > a.entrypoint) {
        return -1;
      }

      return 0;
    })
    .map(build => [build]);

  // Group builds together
  while (path.length > MAX_BUILD_GROUPS) {
    path = groupPaths(path);
  }

  // Reverse the paths so that the larger chunks come last
  // including the / directory
  path = path.reverse();

  // TODO - use `path` to create the output

  const buildsAndOutput = [];

  for (const build of builds) {
    buildsAndOutput.push(build);
    const { output, copiedFrom } = build;

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
      log = styleOutput(item);
    } else {
      log = styleBuild(item, times, longestSource);
    }

    const newline = index === buildsAndOutput.length - 1 ? '' : '\n';
    return log + newline;
  });

  return {
    lines: final.length + 1,
    toPrint: `${final.join('')}\n`
  };
};
