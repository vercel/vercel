import path from 'path';

import pkg from '../../../package.json';
import DevServer from '../../util/dev/server';
import parseListen from '../../util/dev/parse-listen';
import { Output } from '../../util/output';
import { NowContext } from '../../types';

type Options = {
  '--debug'?: boolean;
  '--listen'?: string;
};

export default async function dev(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  output.dim(
    `Now CLI ${pkg.version} dev (beta) — https://zeit.co/feedback`
  );

  const [dir = '.'] = args;
  const cwd = path.resolve(dir);
  const listen = parseListen(opts['--listen'] || '3000');
  const debug = opts['--debug'] || false;
  const devServer = new DevServer(cwd, { output, debug });

  process.once('SIGINT', () => devServer.stop());

  await devServer.start(...listen);
}
