/**
 * Public surface of the `@vercel/connect/authjs` subpath.
 *
 * Holds Auth.js (NextAuth core) helpers for adapting Vercel Connect
 * to the `OAuth2Config` provider shape. `@auth/core` is an optional
 * peer dependency: importing this entrypoint requires it to be
 * installed in the consumer project, but the rest of
 * `@vercel/connect` works without it.
 */
export {
  connect,
  type AuthJsConnectOptions,
  type ConnectProfile,
} from './connect-provider.js';
