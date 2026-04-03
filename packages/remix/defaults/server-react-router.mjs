import * as RR from 'react-router';
import * as build_ from 'virtual:react-router/server-build';
const build = build_.default || build_;

// A custom server entrypoint exports a Web API-compatible handler function.
// Otherwise, assume the default export is the React Router app manifest.
export default typeof build === 'function'
  ? // A custom server entrypoint is expected to export
    // a Web API-compatible handler function
    build
  : // Otherwise, assume the default export is
    // the React Router app manifest
    (() => {
      const handler = RR.createRequestHandler(build);

      // RouterContextProvider is only available in 7.9.0+
      // wrap the handler to provide a RouterContextProvider
      // if we're using the v8 middleware
      return request =>
        build.future.v8_middleware
          ? handler(request, new RR.RouterContextProvider())
          : handler(request);
    })();
