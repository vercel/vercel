import { _experimental_convertRuntimeToPlugin } from '@vercel/build-utils';
import * as ruby from '@vercel/ruby';

export const build = _experimental_convertRuntimeToPlugin(
  ruby.build,
  'vercel-plugin-ruby',
  '.rb'
);

//export const startDevServer = ruby.startDevServer;
