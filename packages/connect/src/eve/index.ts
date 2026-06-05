/**
 * Public surface of the `@vercel/connect/eve` subpath.
 *
 * Holds Eve-specific helpers that adapt the Vercel Connect SDK to
 * Eve's connection runtime. Each helper lives in its own module;
 * this barrel re-exports the public API so consumers import
 * everything from `@vercel/connect/eve`.
 */
export {
  connect,
  type EveAuthorizationInput,
  type EveAuthorizationOptions,
  type EveConnectAuthorizationDefinition,
  type ConnectAuthorizationPhase,
  type ConnectAuthorizationState,
  type VercelConnectMetadata,
} from './connection-authorization.js';

export {
  CONNECT_OAUTH_ISSUER,
  connectOAuth,
  type ConnectOAuthAudienceEnvironment,
  type ConnectOAuthEnvironment,
  type ConnectOAuthOptions,
} from './connect-oauth.js';

export { connectSlackCredentials } from './slack-credentials.js';
