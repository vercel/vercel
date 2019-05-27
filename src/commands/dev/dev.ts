import path from 'path';

import { Output } from '../../util/output';
import { NowContext } from '../../types';
import pkg from '../../../package.json';

import DevServer from './lib/dev-server';

type Options = {
  '--debug': boolean;
  '-d': boolean;
  '--port': number;
  '-p': number;
  '--cert': string;
  '-c': string;
  '--key': string;
  '-k': string;
};

export default async function dev(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  output.dim(`Now CLI ${pkg.version} dev (beta) — https://zeit.co/feedback/dev`);

  const [dir = '.'] = args;
  const cwd = path.join(process.cwd(), dir);
  const port = opts['-p'] || opts['--port'];
  const debug = opts['-d'] || opts['--debug'];
  const cert = opts['-c'] || opts['--cert'];
  const key = opts['-k'] || opts['--key'];
  const devServer = new DevServer(cwd, { output, debug, ssl: cert && key ? { cert, key } : null });

  process.once('SIGINT', devServer.stop.bind(devServer));

  await devServer.start(port);
}
