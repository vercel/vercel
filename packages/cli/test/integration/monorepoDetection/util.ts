import path from 'node:path';
import execa from 'execa';

const binaryPath = path.resolve(__dirname, `../../../scripts/start.js`);

const defaultOptions: execa.Options = { reject: false };

const defaultArgs: Array<string> = [];

export const executeVercelCLI = (
  args: Array<string>,
  options: execa.Options
) => {
  return execa(binaryPath, [...defaultArgs, ...args], {
    ...defaultOptions,
    ...options,
  });
};
