import { createRequestHandler } from '@remix-run/server-runtime';
import build from './build-edge.js';
export default createRequestHandler(build);
