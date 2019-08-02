import path from 'path';

import pkg from '../../../package.json';
import DevServer from '../../util/dev/server';
import { Output } from '../../util/output';
import { NowContext } from '../../types';

type Options = {
  '--debug': boolean;
  '-d': boolean;
  '--port': number;
  '-p': number;
};

export default async function dev(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  output.dim(
    `Now CLI ${pkg.version} dev (beta) — https://zeit.co/feedback/dev`
  );

  const [dir = '.'] = args;
  const cwd = path.resolve(dir);
  const port = opts['-p'] || opts['--port'];
  const debug = opts['-d'] || opts['--debug'];
  const devServer = new DevServer(cwd, { output, debug });

  process.once('SIGINT', devServer.stop.bind(devServer));

  await devServer.start(port);
}
