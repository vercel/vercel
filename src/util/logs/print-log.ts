import chalk from 'chalk';
import { Output } from '../output';
import { Event } from '../../types';
import { shortTimeFormat } from '../output/format-time';

const colorMap = new Map();

let lastIndex: number | null = null;
const COLOR_LIST = ['green', 'yellow', 'blue', 'magenta', 'cyan'];

function getNextColor() {
  if (lastIndex === null) {
    lastIndex = 0;
    return COLOR_LIST[lastIndex];
  }

  let nextIndex = lastIndex + 1;

  if (nextIndex >= COLOR_LIST.length) {
    nextIndex = 0;
  }

  lastIndex = nextIndex;
  return COLOR_LIST[lastIndex];
}

function getColor(buildId: string) {
  if (colorMap.has(buildId)) {
    return colorMap.get(buildId);
  }

  const color = getNextColor();
  colorMap.set(buildId, color);
  return color;
}

interface Options {
  output: Output;
  longestBuild?: number;
  timeFormat?: 'short' | 'long' | null;
}

export default async function printLog(event: Event, options: Options) {
  if (event.type !== 'stdout' && event.type !== 'stderr') {
    throw new Error(`Event must be either of type "stdout" or "stderr" but received "${event.type}" instead`);
  }

  const { output, longestBuild, timeFormat } = options;
  const isBuild = event.payload.info.type === 'build';

  const time = timeFormat === 'short'
    ? shortTimeFormat(event.payload.date)
    : new Date(event.payload.date).toISOString();

  const source = isBuild ? event.payload.info.entrypoint : null;
  const text = event.payload.text;

  // @ts-ignore
  const sourceOutput = source ? (`${chalk[getColor(event.payload.info.name)](`[${source}]`)  } `) : '';
  const prefix = `${chalk.grey(time)} ${sourceOutput}`;

  const currentPrefixLength = time.length + (source ? (source.length + 3) : 0) + 1;
  const prefixLength = time.length + (source ? ((longestBuild || source.length) + 3) : 0) + 1;

  const content = text.split('\n').map((line: string, index: number) => {
    return `${(index === 0
      ? ' '.repeat(prefixLength - currentPrefixLength)
      : ' '.repeat(prefixLength)
    ) + line  }\n`;
  }).join('');

  output.print(prefix + content);
}
