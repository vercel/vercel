import { convertRuntimeToPlugin } from '@vercel/build-utils';
import * as go from '@vercel/go';
import { name } from '../package.json';

export const build = convertRuntimeToPlugin(go.build, name, '.go');

export const startDevServer = go.startDevServer;
