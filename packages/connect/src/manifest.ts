export const VERCEL_CONNECT_MANIFEST_KIND = 'vercel-connect-manifest';
export const VERCEL_CONNECT_MANIFEST_SCHEMA_VERSION = 1;

export interface VercelConnectManifest {
  readonly kind: typeof VERCEL_CONNECT_MANIFEST_KIND;
  readonly schemaVersion: typeof VERCEL_CONNECT_MANIFEST_SCHEMA_VERSION;
  readonly generator: VercelConnectManifestGenerator;
  readonly requirements: readonly VercelConnectRequirement[];
}

export interface VercelConnectManifestGenerator {
  readonly name: string;
  readonly version: string;
}

export type VercelConnectTarget =
  | { readonly mode: 'direct'; readonly locator: string }
  | { readonly mode: 'binding'; readonly reference: string };

export interface VercelConnectRequirement {
  readonly target: VercelConnectTarget;
  readonly connector: VercelConnectConnector;
  readonly resource?: VercelConnectResource;
  readonly access?: VercelConnectAccess;
  readonly triggers?: readonly VercelConnectTrigger[];
  readonly uses: readonly VercelConnectUse[];
}

export interface VercelConnectConnector {
  readonly type: string;
  readonly configuration?: Readonly<Record<string, unknown>>;
}

export interface VercelConnectResource {
  readonly protocol: string;
  readonly url: string;
}

export interface VercelConnectAccess {
  readonly principalTypes: readonly ('app' | 'user')[];
}

export interface VercelConnectTrigger {
  readonly method: string;
  readonly path: string;
}

export interface VercelConnectUse {
  readonly kind: 'channel' | 'connection';
  readonly name: string;
  readonly logicalPath: string;
}
