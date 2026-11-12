// Names shared by the CLI and the deployment's function, which is uploaded with
// it: the env `vc dev --tunnel` sets on the deployment, and its routing.

/** api-dev-tunnel's URL, from create-session. */
export const RELAY_URL_ENV = 'DEV_TUNNEL_RELAY_URL';

/** The tunnel's server token, which authenticates the deployment's Dials. */
export const SERVER_TOKEN_ENV = 'DEV_TUNNEL_SERVER_TOKEN';

/** The dev server's port on the developer's machine. */
export const PORT_ENV = 'DEV_TUNNEL_PORT';

/**
 * The query parameter the deployment's last route passes the path in, as the
 * project's own routes left it. The function's URL keeps the browser's path,
 * with every rewrite's query merged in.
 */
export const ROUTED_PATH_PARAM = '__vc_tunnel_path';

/**
 * Set by the route that passes ROUTED_PATH_PARAM, and stripped from every
 * request first, so it marks a request the deployment routed. One that
 * reached the function directly could carry any ROUTED_PATH_PARAM.
 */
export const ROUTED_HEADER = 'x-vc-tunnel-routed';
