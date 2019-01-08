import path from 'path'

import { Output } from '../../util/output';
import { NowContext } from '../../types';

import DevServer from './dev-server';

type Options = {
  '--debug': boolean;
  '--port': number;
  '-p': number;
};

export default async function dev (
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const [dir = '.'] = args;
  const cwd = path.join(process.cwd(), dir);
  const port = opts['-p'] || opts['--port'];

  const devServer = new DevServer(cwd);
  await devServer.start(port);
}
