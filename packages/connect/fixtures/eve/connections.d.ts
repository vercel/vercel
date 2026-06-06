export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ConnectionPrincipal =
  | { readonly type: 'app' }
  | {
      readonly type: 'user';
      readonly id: string;
      readonly issuer?: string;
    };

export interface TokenResult {
  readonly token: string;
  readonly expiresAt?: number;
}

export interface ConnectionAuthorizationChallenge {
  readonly url: string;
  readonly instructions?: string;
  readonly userCode?: string;
  readonly expiresAt?: string;
}

export interface InteractiveAuthorizationDefinition<
  State extends JsonValue = JsonValue,
> {
  readonly principalType: 'user';
  readonly getToken: (options: {
    readonly principal: ConnectionPrincipal;
  }) => Promise<TokenResult>;
  readonly startAuthorization: (options: {
    readonly principal: ConnectionPrincipal;
    readonly callbackUrl?: string;
    readonly webhook?: string;
  }) => Promise<{
    readonly challenge: ConnectionAuthorizationChallenge;
    readonly state: State;
  }>;
  readonly completeAuthorization: (options: {
    readonly principal: ConnectionPrincipal;
  }) => Promise<TokenResult>;
}

export interface NonInteractiveAuthorizationDefinition {
  readonly principalType: 'app';
  readonly getToken: (options: {
    readonly principal: ConnectionPrincipal;
  }) => Promise<TokenResult>;
}

export class ConnectionAuthorizationRequiredError extends Error {
  constructor(connectionName: string, options?: { readonly message?: string });
}

export class ConnectionAuthorizationFailedError extends Error {
  constructor(
    connectionName: string,
    options?: {
      readonly message?: string;
      readonly reason?: string;
      readonly retryable?: boolean;
    }
  );
}
