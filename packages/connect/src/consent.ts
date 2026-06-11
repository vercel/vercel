import type { ConnectTokenParams } from './token.js';

/**
 * Surfaced when Connect has no cached grant for the configured subject
 * and the caller must send the user through the hosted consent page.
 *
 * Shared by both Connect → AI SDK integration paths:
 * - the MCP adapter ({@link connectAuthProvider}) raises it from
 *   `redirectToAuthorization`, and
 * - {@link withConnect} returns a structured authorization-required
 *   output when token acquisition reports the user has not authorized yet.
 */
export interface ConsentChallenge {
  readonly connector: string;
  readonly subject: ConnectTokenParams['subject'];
  /** Consent URL to redirect the user to. */
  readonly url: string;
  readonly request: string;
  readonly verifier: string;
  /**
   * Device code to display to the user when Connect issues a
   * device-flow authorization. Present only when the connector uses
   * device flow.
   */
  readonly deviceCode?: string;
  /** Epoch-ms expiry of the consent challenge, when Connect reports one. */
  readonly expiresAt?: number;
}

/**
 * Thrown when the user has no Connect grant for the configured subject.
 * Catch at the boundary (route handler / `streamText` call site) and
 * redirect the user to `error.url`.
 */
export class ConsentRequiredError extends Error {
  readonly name = 'ConsentRequiredError';
  readonly connector: string;
  readonly subject: ConnectTokenParams['subject'];
  readonly url: string;
  readonly request: string;
  readonly verifier: string;
  readonly deviceCode?: string;
  readonly expiresAt?: number;

  constructor(challenge: ConsentChallenge) {
    super(
      `Vercel Connect: user authorization required for connector "${challenge.connector}". Redirect the user to challenge.url to grant access.`
    );
    this.connector = challenge.connector;
    this.subject = challenge.subject;
    this.url = challenge.url;
    this.request = challenge.request;
    this.verifier = challenge.verifier;
    this.deviceCode = challenge.deviceCode;
    this.expiresAt = challenge.expiresAt;
  }
}
