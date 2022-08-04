import chalk from 'chalk';
import bytes from 'bytes';
import { isReady, isFailed } from '../build-state';
import { Build, BuildOutput } from '../../types';

export interface Times {
  [id: string]: string | null;
}

// That's the spacing between the source, state and time
const padding = 8;

// That's the max numbers of builds and outputs that will be displayed
const MAX_BUILD_GROUPS = 5;
const MAX_OUTPUTS_PER_GROUP = 5;

const hasOutput = (b: Build) => Array.isArray(b.output) && b.output.length > 0;

// Get the common path out of multiple builds
const getCommonPath = (buildGroup: Build[]) => {
  const commonPath = [];
  const splits = buildGroup.map(build =>
    getDirPath(build.entrypoint).split('/')
  );
  const shortest = splits.reduce(
    (prevValue, currentValue) => Math.min(prevValue, currentValue.length),
    Infinity
  );

  for (let i = 0; i <= shortest; i++) {
    const first = splits[0][i];
    if (splits.every(pathParts => pathParts[i] === first)) {
      commonPath.push(first);
      continue;
    }

    break;
  }

  return commonPath.join('/') || '/';
};

const styleBuild = (build: Build, times: Times, longestSource: number) => {
  const { entrypoint, id } = build;
  const time = typeof times[id] === 'string' ? times[id] : '';

  let pathColor = chalk.cyan;

  if (isFailed(build)) {
    pathColor = chalk.red;
  }

  const entry = entrypoint.padEnd(longestSource + padding);
  const prefix = hasOutput(build) ? '┌' : '╶';

  return `${chalk.grey(prefix)} ${pathColor(entry)}${time}`;
};

const styleHiddenBuilds = (
  commonPath: string,
  buildGroup: Build[],
  times: Times,
  longestSource: number,
  isHidden = false
) => {
  const { id } = buildGroup[0];
  const entry = commonPath.padEnd(longestSource + padding);
  const time = typeof times[id] === 'string' ? times[id] : '';
  const prefix = isHidden === false && buildGroup.some(hasOutput) ? '┌' : '╶';

  let pathColor = chalk.cyan;

  if (buildGroup.every(isFailed)) {
    pathColor = chalk.red;
  }

  if (isHidden) {
    pathColor = chalk.grey;
  }

  return `${chalk.grey(prefix)} ${pathColor(entry)}${time}`;
};

const styleOutput = (
  output: BuildOutput,
  readyState: Build['readyState'],
  isLast: boolean
) => {
  const { type, path, size, lambda } = output;
  const prefix = type === 'lambda' ? 'λ ' : '';
  const finalSize = size ? ` ${chalk.grey(`(${bytes(size)})`)}` : '';

  let color = chalk.grey;
  let finalRegion = '';

  if (isReady({ readyState })) {
    color = chalk;
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

const getDirPath = (
  path: string,
  level = 0,
  highestLevel: number | null = null
) => {
  const parts = path.split('/').slice(0, -1);

  if (highestLevel === null || level === 0) {
    return parts.join('/');
  }

  const reverseLevel = highestLevel - level;
  return parts.slice(0, reverseLevel).join('/');
};

const sortByEntrypoint = (a: Build, b: Build) => {
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

const groupBuilds = (
  buildList: Build[][],
  highestLevel: number,
  counter: number
) => {
  const currentIndex = counter % buildList.length;
  const __level = Math.ceil(counter / buildList.length);
  const _level = (__level === 0 ? 1 : __level) - 1;
  const level = _level > highestLevel ? highestLevel : _level;
  const currentPath = getDirPath(
    buildList[currentIndex][0].entrypoint,
    level,
    highestLevel
  );

  const nextList = [];
  const currentGroup = [];

  for (let i = 0; i < buildList.length; i++) {
    const group = buildList[i];
    const path = getDirPath(group[0].entrypoint, level, highestLevel);

    if (path === currentPath) {
      currentGroup.push(...group);
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

export default (builds: Build[], times: Times) => {
  // Sort the builds by path
  // so that the grouping will be easier
  let path = builds.sort(sortByEntrypoint).map(build => [build]);

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
  let hiddenBuildGroup: Build[] = [];

  // Ungroup the root files
  path = (() => {
    const nextList = [];
    const rootList: Build[][] = [];

    for (const group of path) {
      if (getCommonPath(group) === '/') {
        group.map(item => rootList.push([item]));
      } else {
        nextList.push(group);
      }
    }

    lengthWithoutRootPaths = nextList.length;
    rootList.map(group => nextList.push(group));

    return nextList;
  })();

  for (const buildGroup of path) {
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
        continue;
      }
    } else if (buildGroup.length === 1) {
      const item = buildGroup[0];
      final.push(`${styleBuild(item, times, longestSource)}\n`);
      finalBuildsLength++;
    } else {
      final.push(
        `${styleHiddenBuilds(
          `${commonPath}/*`,
          buildGroup,
          times,
          longestSource
        )}\n`
      );
      finalBuildsLength++;
    }

    // Get the first five outputs when the deployment is ready
    const outputs: BuildOutput[] = [];
    for (const build of buildGroup) {
      if (Array.isArray(build.output)) {
        outputs.push(...build.output);
      }
    }

    outputs
      .slice(0, MAX_OUTPUTS_PER_GROUP)
      .forEach((output, index) =>
        final.push(
          `${styleOutput(output, 'READY', outputs.length === index + 1)}\n`
        )
      );

    if (outputs.length > MAX_OUTPUTS_PER_GROUP) {
      final.push(
        chalk.grey(
          `└── ${outputs.length - MAX_OUTPUTS_PER_GROUP} output items hidden\n`
        )
      );
    }
  }

  if (hiddenBuildGroup.length) {
    final.push(
      `${styleHiddenBuilds(
        `${hiddenBuildGroup.length} builds hidden`,
        hiddenBuildGroup,
        times,
        longestSource,
        true
      )}\n`
    );
  }

  return {
    lines: final.length + 1,
    toPrint: `${final.join('')}`,
  };
};
