import { parseArgs as parseNodeArgs } from 'node:util';
import { build, serve, srvxOptions } from './index.js';

const args = process.argv.slice(2);
const options = parseArgs(args);

export const main = async () => {
  const { cwd, out, ...rest } = options.values;
  const [command, entrypoint] = options.positionals;
  if (command === 'build') {
    const { tsPromise } = await build({ cwd, out, entrypoint });
    await tsPromise;
  } else {
    await serve({ cwd, rest });
  }
};

function parseArgs(args: string[]) {
  const { values, positionals } = parseNodeArgs({
    args,
    allowPositionals: true,
    options: {
      cwd: {
        type: 'string',
        default: process.cwd(),
      },
      out: {
        type: 'string',
        default: 'dist',
      },
      ...srvxOptions,
    },
  });

  return {
    values,
    positionals,
  };
}
