/**
 * Public surface of the `@vercel/connect/betterauth` subpath.
 *
 * Holds Better Auth-specific helpers for adapting Vercel Connect to
 * the `genericOAuth` plugin. `better-auth` is an optional peer
 * dependency: importing this entrypoint requires it to be installed
 * in the consumer project, but the rest of `@vercel/connect` works
 * without it.
 */
export { connect, type BetterAuthConnectOptions } from './connect-provider.js';

export {
  ConnectError,
  type ConnectErrorOptions,
  type ConnectVendorErrorPayload,
} from '../token.js';
