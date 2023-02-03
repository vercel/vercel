import { createRequestHandler } from '@remix-run/server-runtime';
import build from './index.js';
export default createRequestHandler(build);
