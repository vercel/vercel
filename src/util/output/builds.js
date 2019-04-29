import chalk from 'chalk';
import title from 'title';
import bytes from 'bytes';
import { isReady, isFailed } from '../build-state';

// That's how long the word "Initializing" is
const longestState = 12;

// That's the spacing between the source, state and time
const padding = 8;

// That's the max numbers of builds and outputs that will be displayed
const MAX_BUILD_GROUPS = 5;
const MAX_OUTPUTS_PER_GROUP = 5;

const prepareState = state => title(state.replace('_', ' '));

// Get the common path out of multiple builds
const getCommonPath = (buildGroup) => {
  const commonPath = [];
  const splits = buildGroup.map((build) => getDirPath(build.entrypoint).split('/'));
  const shortest = splits.reduce((prevValue, currentValue) =>
    prevValue.length < currentValue.length
      ? prevValue.length
      : currentValue.length
  );

  for (let i = 0; i <= shortest; i++) {
    const first = splits[0][i];
    if (splits.every((pathParts) => pathParts[i] === first)) {
      commonPath.push(first);
      continue;
    }

    break;
  }

  return commonPath.join('/') || '/';
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

  return `${chalk.grey(prefix)} ${pathColor(entry)}${stateColor(state)}${time}`;
};

const styleHiddenBuilds =  (commonPath, buildGroup, times, longestSource, isHidden = false) => {
  const { id } = buildGroup[0];
  const entry = commonPath.padEnd(longestSource + padding);
  const time = typeof times[id] === 'string' ? times[id] : '';
  const prefix = isHidden === false && buildGroup.some((build) => build.hasOutput) ? '┌' : '╶';

  // Set the defaults so that they will be sorted
  const stateMap = {
    READY: 0,
    ERROR: 0,
    BUILDING: 0
  };

  buildGroup.map(({ readyState }) => {
    stateMap[readyState] = stateMap[readyState]
      ? stateMap[readyState] + 1
      : 1;

    return readyState;
  });

  let state = Object.keys(stateMap).map((readyState) => {
    const counter = stateMap[readyState];
    const name = prepareState(readyState);

    if (!counter) {
      return null;
    }

    return `${counter > 9 ? '9+' : counter} ${name}`;
  }).filter(s => s).join(', ')

  // Since the longestState might still be shorter
  // than multiple states we still want to ensure
  // a space between the states and the time
  state = `${state} `.padEnd(longestState + padding);

  let pathColor = chalk.cyan;
  let stateColor = chalk.grey;

  if (buildGroup.every(isReady)) {
    stateColor = item => item;
  } else if (buildGroup.every(isFailed)) {
    stateColor = chalk.red;
    pathColor = chalk.red;
  }

  if (isHidden) {
    pathColor = chalk.grey;
  }

  return `${chalk.grey(prefix)} ${pathColor(entry)}${stateColor(state)}${time}`;
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

const getDirPath = (path, level = 0, highestLevel = null) => {
  const parts = path.split('/').slice(0, -1);

  if (highestLevel === null || level === 0) {
    return parts.join('/');
  }

  const reverseLevel = highestLevel - level;
  return parts.slice(0, reverseLevel).join('/');
};

const sortByEntrypoint = (a, b) => {
  const aPath = getDirPath(a.entrypoint);
  const bPath = getDirPath(b.entrypoint);

  if (aPath === '') {
    return 1;
  }

  if (bPath === '') {
    return -1;
  }

  if (aPath > bPath) {
    return 1;
  }

  if (bPath > aPath) {
    return -1;
  }

  return 0;
};

const groupBuilds = (buildList, highestLevel, counter) => {
  const currentIndex = counter % (buildList.length);
  const __level = Math.ceil(counter / buildList.length);
  const _level = (__level === 0 ? 1 : __level) - 1;
  const level = _level > highestLevel ? highestLevel : _level;
  const currentPath = getDirPath(buildList[currentIndex][0].entrypoint, level, highestLevel);

  const nextList = [];
  let currentGroup = [];

  for (let i = 0; i < buildList.length; i++) {
    const group = buildList[i];
    const path = getDirPath(group[0].entrypoint, level, highestLevel);

    if (path === currentPath) {
      currentGroup = currentGroup.concat(group);
    } else {
      nextList.push(group);
    }
  }

  if (currentIndex === 0) {
    nextList.unshift(currentGroup);
  } else {
    nextList.splice(currentIndex, 0, currentGroup);
  }

  return nextList;
};

const prepareBuild = (build) => {
   build.hasOutput = Array.isArray(build.output) && build.output.length > 0;

   if (build.hasOutput) {
     build.output = build.output.map((item) => {
       item.readyState = build.readyState;
       return item;
     });
   }

   return build;
};

export default (builds, times) => {
  // Sort the builds by path
  // so that the grouping will be easier
  let path = builds
    .map(prepareBuild)
    .sort(sortByEntrypoint)
    .map(build => [build]);

  const highestLevel = builds.reduce((prev, curr) => {
    const partCounter = curr.entrypoint.split('/').length - 1;
    return partCounter > prev ? partCounter : prev;
  }, 0);

  // Group builds together
  let counter = 0;

  while (path.length > MAX_BUILD_GROUPS) {
    path = groupBuilds(path, highestLevel, counter);
    counter++;
  }

  // Reverse the paths so that the larger chunks come last
  // including the / directory
  path = path.reverse();

  const longestSource = builds.reduce((final, current) => {
    const { length } = current.entrypoint;
    return length > final ? length : final;
  }, 0);

  const final = [];
  let finalBuildsLength = path.length;
  let lengthWithoutRootPaths = path.length;
  let hiddenBuildGroup = [];

  // Ungroup the root files
  path = (() => {
    const nextList = [];
    const rootList = [];

    for (const group of path) {
      if (getCommonPath(group) === '/') {
        group.map((item) => rootList.push([item]));
      } else {
        nextList.push(group);
      }
    }

    lengthWithoutRootPaths = nextList.length;
    rootList.map((group) => nextList.push(group));

    return nextList;
  })();

  path.map((buildGroup) => {
    const commonPath = getCommonPath(buildGroup);

    // All items with the common path / are a single group
    if (commonPath === '/') {
      if (
        lengthWithoutRootPaths <= MAX_BUILD_GROUPS &&
        finalBuildsLength <= MAX_BUILD_GROUPS
      ) {
        const item = buildGroup[0];
        final.push(`${styleBuild(item, times, longestSource)}\n`);
        finalBuildsLength++;
      } else {
        hiddenBuildGroup.push(buildGroup[0]);
        return buildGroup;
      }
    } else if (buildGroup.length === 1) {
      const item = buildGroup[0];
      final.push(`${styleBuild(item, times, longestSource)}\n`);
      finalBuildsLength++;
    } else {
      final.push(`${styleHiddenBuilds(`${commonPath}/*`, buildGroup, times, longestSource)}\n`);
      finalBuildsLength++;
    }

    // Get the first five outputs when the deployment is ready
    const outputs = buildGroup.reduce((prevValue, currentValue) => (
      prevValue.concat(Array.isArray(currentValue.output)
        ? currentValue.output
        : []
      )
    ), []);

    outputs.slice(0, MAX_OUTPUTS_PER_GROUP).map((output, index) => (
      final.push(`${styleOutput({
        ...output,
        isLast: outputs.length === (index + 1)
      })}\n`)
    ));

    if (outputs.length > MAX_OUTPUTS_PER_GROUP) {
      final.push(chalk.grey(`└── ${outputs.length - MAX_OUTPUTS_PER_GROUP} output items hidden\n`));
    }

    return buildGroup;
  });

  if (hiddenBuildGroup.length) {
    final.push(`${styleHiddenBuilds(
      `${hiddenBuildGroup.length} builds hidden`,
      hiddenBuildGroup,
      times,
      longestSource,
      true
    )}\n`);
  }

  return {
    lines: final.length + 1,
    toPrint: `${final.join('')}`
  };
};
