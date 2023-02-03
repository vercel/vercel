import { createRequestHandler } from '@remix-run/vercel';
import * as build from './index.mjs';
export default createRequestHandler({ build });
