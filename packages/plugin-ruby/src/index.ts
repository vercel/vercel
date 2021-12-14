import { convertRuntimeToPlugin } from '@vercel/build-utils';
import * as ruby from '@vercel/ruby';

export const build = convertRuntimeToPlugin(ruby.build, 'vercel-plugin-ruby', '.rb');

//export const startDevServer = ruby.startDevServer;
