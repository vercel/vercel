import { createRequestHandler } from '@remix-run/server-runtime';
import build from '@remix-run/dev/server-build';
export default createRequestHandler(build);
