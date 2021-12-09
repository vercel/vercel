import { convertRuntimeToPlugin } from '@vercel/build-utils';
import * as node from '@vercel/node';

export const build = convertRuntimeToPlugin(
  node.build,
  'vercel-plugin-node',
  '.js'
);

export const startDevServer = node.startDevServer;
