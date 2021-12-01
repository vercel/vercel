import { convertRuntimeToPlugin } from '@vercel/build-utils';
import * as python from '@vercel/python';
import { name } from '../package.json';

export const build = convertRuntimeToPlugin(python.build, name, '.py');

//export const startDevServer = python.startDevServer;
