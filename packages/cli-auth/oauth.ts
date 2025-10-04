import * as z from 'zod/mini';

const AuthorizationServerMetadata = z.object({
  issuer: z.url(),
  device_authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  revocation_endpoint: z.url(),
  jwks_uri: z.url(),
  introspection_endpoint: z.url(),
});

export type AuthorizationServerMetadata = z.infer<
  typeof AuthorizationServerMetadata
>;

const DeviceAuthorization = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.url(),
  verification_uri_complete: z.url(),
  expires_in: z.number(),
  interval: z.number(),
});

const IntrospectionResponse = z.object({
  active: z.boolean(),
  client_id: z.optional(z.string()),
  session_id: z.optional(z.string()),
});

export function OAuth(config: {
  issuer: URL;
  clientId: string;
  userAgent: string;
}) {
  const { issuer, clientId, userAgent } = config;
  let as: AuthorizationServerMetadata | undefined;

  function assertAs(as: unknown): asserts as is AuthorizationServerMetadata {
    if (as) return;
    throw new Error(
      'Authorization Server Metadata not initialized. Call init() first.'
    );
  }

  return {
    async init() {
      as ??= await this.authorizationServerMetadata();
      return { ...this, as };
    },
    /**
     * Returns the Authorization Server Metadata
     *
     * @see https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfigurationRequest
     * @see https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfigurationResponse
     */
    async authorizationServerMetadata(): Promise<AuthorizationServerMetadata> {
      const response = await fetch(
        new URL('.well-known/openid-configuration', issuer),
        {
          headers: {
            'Content-Type': 'application/json',
            'user-agent': userAgent,
          },
        }
      );

      const json = await response.json();
      as = AuthorizationServerMetadata.parse(json);

      if (as.issuer !== issuer.origin) {
        throw new OAuthError(
          `Issuer mismatch: expected ${issuer}, got ${as.issuer}`,
          json
        );
      }

      return as;
    },
    /**
     * Perform the Device Authorization Request
     *
     * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.1
     * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.2
     */
    async deviceAuthorizationRequest(): Promise<{
      /** The device verification code. */
      device_code: string;
      /** The end-user verification code. */
      user_code: string;
      /**
       * The minimum amount of time in seconds that the client
       * SHOULD wait between polling requests to the token endpoint.
       */
      interval: number;
      /** The end-user verification URI on the authorization server. */
      verification_uri: string;
      /**
       * The end-user verification URI on the authorization server,
       * including the `user_code`, without redirection.
       */
      verification_uri_complete: string;
      /**
       * The absolute lifetime of the `device_code` and `user_code`.
       * Calculated from `expires_in`.
       */
      expiresAt: number;
    }> {
      assertAs(as);
      const response = await fetch(as.device_authorization_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'user-agent': userAgent,
        },
        body: new URLSearchParams({
          client_id: clientId,
          scope: 'openid offline_access',
        }),
      });

      const json = await response.json();
      const parsed = DeviceAuthorization.safeParse(json);

      if (!parsed.success) {
        throw new OAuthError(
          `Failed to parse device authorization response: ${parsed.error.message}`,
          json
        );
      }

      return {
        device_code: parsed.data.device_code,
        user_code: parsed.data.user_code,
        verification_uri: parsed.data.verification_uri,
        verification_uri_complete: parsed.data.verification_uri_complete,
        expiresAt: Date.now() + parsed.data.expires_in * 1000,
        interval: parsed.data.interval,
      };
    },
    /**
     * Perform the Device Access Token Request
     *
     * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.4
     */
    async deviceAccessTokenRequest(
      device_code: string
    ): Promise<[Error] | [null, Response]> {
      assertAs(as);
      try {
        return [
          null,
          await fetch(as.token_endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'user-agent': userAgent,
            },
            body: new URLSearchParams({
              client_id: clientId,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
              device_code,
            }),
            signal: AbortSignal.timeout(10 * 1000),
          }),
        ];
      } catch (error) {
        if (error instanceof Error) return [error];
        return [
          new Error('An unknown error occurred. See the logs for details.', {
            cause: error,
          }),
        ];
      }
    },
    /**
     * Process the Token request Response
     *
     * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.5
     */
    async processTokenResponse(
      response: Response
    ): Promise<[OAuthError] | [null, TokenSet]> {
      const json = await response.json();
      const processed = TokenSet.safeParse(json);

      if (!processed.success) {
        return [
          new OAuthError(
            `Failed to parse token response: ${processed.error.message}`,
            json
          ),
        ];
      }

      return [null, processed.data];
    },
    /**
     * Perform a Token Revocation Request.
     *
     * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.1
     * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.2
     */
    async revokeToken(token: string): Promise<OAuthError | undefined> {
      assertAs(as);
      const response = await fetch(as.revocation_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'user-agent': userAgent,
        },
        body: new URLSearchParams({ token, client_id: clientId }),
      });

      if (response.ok) return;
      const json = await response.json();

      return new OAuthError('Revocation request failed', json);
    },
    /**
     * Perform Refresh Token Request.
     *
     * @see https://datatracker.ietf.org/doc/html/rfc6749#section-6
     */
    async refreshToken(token: string): Promise<TokenSet> {
      assertAs(as);
      const response = await fetch(as.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'user-agent': userAgent,
        },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'refresh_token',
          refresh_token: token,
        }),
      });

      const [tokensError, tokenSet] = await this.processTokenResponse(response);
      if (tokensError) throw tokensError;
      return tokenSet;
    },
    /**
     * Perform Token Introspection Request.
     *
     * @see https://datatracker.ietf.org/doc/html/rfc7662#section-2.1
     */
    async introspectToken(
      token: string
    ): Promise<z.infer<typeof IntrospectionResponse>> {
      assertAs(as);
      const response = await fetch(as.introspection_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'user-agent': userAgent,
        },
        body: new URLSearchParams({ token }),
      });

      const json = await response.json();
      const processed = IntrospectionResponse.safeParse(json);
      if (!processed.success) {
        throw new OAuthError(
          `Failed to parse introspection response: ${processed.error.message}`,
          json
        );
      }

      return processed.data;
    },
  };
}

export type OAuth = ReturnType<typeof OAuth>;

const TokenSet = z.object({
  /** The access token issued by the authorization server. */
  access_token: z.string(),
  /** The type of the token issued */
  token_type: z.literal('Bearer'),
  /** The lifetime in seconds of the access token. */
  expires_in: z.number(),
  /** The refresh token, which can be used to obtain new access tokens. */
  refresh_token: z.optional(z.string()),
  /** The scope of the access token. */
  scope: z.optional(z.string()),
});

type TokenSet = z.infer<typeof TokenSet>;

const OAuthErrorResponse = z.object({
  error: z.enum([
    'invalid_request',
    'invalid_client',
    'invalid_grant',
    'unauthorized_client',
    'unsupported_grant_type',
    'invalid_scope',
    'server_error',
    // Device Authorization Response Errors
    'authorization_pending',
    'slow_down',
    'access_denied',
    'expired_token',
    // Revocation Response Errors
    'unsupported_token_type',
  ]),
  error_description: z.optional(z.string()),
  error_uri: z.optional(z.string()),
});

type OAuthErrorResponse = z.infer<typeof OAuthErrorResponse>;

function processOAuthErrorResponse(
  json: unknown
): OAuthErrorResponse | TypeError {
  try {
    return OAuthErrorResponse.parse(json);
  } catch (error) {
    if (error instanceof z.core.$ZodError) {
      return new TypeError(`Invalid OAuth error response: ${error.message}`);
    }
    return new TypeError('Failed to parse OAuth error response');
  }
}

class OAuthError extends Error {
  name = 'OAuthError';
  code: OAuthErrorResponse['error'];
  cause: Error;
  constructor(message: string, response: unknown) {
    super(message);
    const error = processOAuthErrorResponse(response);
    if (error instanceof TypeError) {
      const message = `Unexpected server response: ${JSON.stringify(response)}`;
      this.cause = new Error(message, { cause: error });
      this.code = 'server_error';
      return;
    }
    let cause = error.error;
    if (error.error_description) cause += `: ${error.error_description}`;
    if (error.error_uri) cause += ` (${error.error_uri})`;

    this.cause = new Error(cause.toString());
    this.code = error.error;
  }
}

export function isOAuthError(error: unknown): error is OAuthError {
  return error instanceof OAuthError;
}
