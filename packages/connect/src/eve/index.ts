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
  type VercelConnectMetadata,
} from './connection-authorization.js';

export {
  CONNECT_OAUTH_ISSUER,
  connectOAuth,
  type ConnectOAuthAudienceEnvironment,
  type ConnectOAuthEnvironment,
  type ConnectOAuthOptions,
} from './connect-oauth.js';

export {
  connectGitHubCredentials,
  type ConnectGitHubCredentialsParams,
} from './github-credentials.js';
export {
  connectLinearCredentials,
  type ConnectLinearCredentialsParams,
} from './linear-credentials.js';
export {
  connectSlackCredentials,
  type ConnectSlackCredentialsParams,
} from './slack-credentials.js';
