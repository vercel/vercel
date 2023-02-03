import { createRequestHandler } from '@remix-run/server-runtime';
import * as build from './index.mjs';
//export default createRequestHandler(build, process.env.NODE_ENV);
export default createRequestHandler(build);
