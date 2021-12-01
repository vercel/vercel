import { convertRuntimeToPlugin } from '@vercel/build-utils';
import * as ruby from '@vercel/ruby';
import { name } from '../package.json';

export const build = convertRuntimeToPlugin(ruby.build, name, '.rb');

//export const startDevServer = ruby.startDevServer;
