import { createRequestHandler } from '@remix-run/server-runtime';
import * as build from '@remix-run/dev/server-build';
export default createRequestHandler(build.default || build);
