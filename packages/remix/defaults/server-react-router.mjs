import { createRequestHandler } from 'react-router';
import * as build_ from 'virtual:react-router/server-build';
const build = build_.default || build_;

const vercelDeploymentId = process.env.VERCEL_DEPLOYMENT_ID;
const vercelSkewProtectionEnabled =
  process.env.VERCEL_SKEW_PROTECTION_ENABLED === '1';

const handler =
  typeof build === 'function'
    ? // A custom server entrypoint is expected to export
      // a Web API-compatible handler function
      build
    : // Otherwise, assume the default export is
      // the React Router app manifest
      createRequestHandler(build);

export default async req => {
  const res = await handler(req);

  if (vercelSkewProtectionEnabled && vercelDeploymentId) {
    res.headers.append('Set-Cookie', `__vdpl=${vercelDeploymentId}; HttpOnly`);
  }

  return res;
};
