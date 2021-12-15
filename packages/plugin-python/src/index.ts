import { _experimental_convertRuntimeToPlugin } from '@vercel/build-utils';
import * as python from '@vercel/python';

export const build = _experimental_convertRuntimeToPlugin(
  python.build,
  'vercel-plugin-python',
  '.py'
);

//export const startDevServer = python.startDevServer;
