import path from 'path';

import { Output } from '../../util/output';
import { NowContext } from '../../types';

import DevServer from './lib/dev-server';

type Options = {
  '--debug': boolean;
  '--port': number;
  '-d': boolean;
  '-p': number;
};

export default async function dev(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const [dir = '.'] = args;
  const cwd = path.join(process.cwd(), dir);
  const port = opts['-p'] || opts['--port'];
  const debug = Boolean(opts['-d'] || opts['--debug']);

  const devServer = new DevServer(cwd, {
    debug,
    output
  });

  process.once('SIGINT', devServer.stop.bind(devServer));

  await devServer.start(port);
}
