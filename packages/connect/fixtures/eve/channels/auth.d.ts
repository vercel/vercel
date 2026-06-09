export interface VerifyOidcConfig {
  readonly claims?: Readonly<Record<string, string | readonly string[]>>;
}

export type AuthFn<Request> = (request: Request) => unknown | Promise<unknown>;

export function extractBearerToken(value: string | null): string | null;

export function verifyOidc(
  token: string,
  config: {
    readonly audiences: readonly string[];
    readonly claims?: VerifyOidcConfig['claims'];
    readonly clockSkewSeconds?: number;
    readonly discoveryUrl?: string;
    readonly issuer: string;
    readonly subjects?: readonly string[];
  }
): Promise<
  | { readonly ok: true; readonly sessionAuth: unknown }
  | { readonly ok: false; readonly sessionAuth?: never }
>;

export function vercelOidc(): unknown;
