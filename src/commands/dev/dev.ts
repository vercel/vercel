import path from 'path';

import { Output } from '../../util/output';
import { NowContext } from '../../types';

import DevServer from './lib/dev-server';

type Options = {
  '--debug': boolean;
  '--port': number;
  '-p': number;
  '--nodejs-preview': boolean;
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
  const debug = opts['--debug'];
  const nodejsPreview = opts['--nodejs-preview'];

  const devServer = new DevServer(cwd, {
    debug,
    nodejsPreview
  });

  await devServer.start(port);
}
