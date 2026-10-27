export const CONNECT_MANIFEST_KIND = 'vercel-connect-manifest';
export const CONNECT_MANIFEST_VERSION = 1;

export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue =
  | boolean
  | null
  | number
  | string
  | readonly JsonValue[]
  | JsonObject;

export type ConnectSubjectType = 'app' | 'user';

export type ConnectInterface =
  | { readonly protocol: 'mcp' | 'openapi'; readonly url: string }
  | {
      readonly npm: string;
      readonly protocol: 'custom';
      readonly url: string;
    };

export interface ConnectRequirement {
  readonly connect: {
    readonly manifest: JsonObject;
    readonly service: string;
    readonly subjectTypes: readonly ConnectSubjectType[];
    readonly type?: string;
  };
  readonly interfaces: readonly ConnectInterface[];
  readonly target: string;
  readonly triggers: readonly { readonly path: string }[];
  readonly uses: readonly {
    readonly kind: 'channel' | 'connection';
    readonly logicalPath: string;
    readonly name: string;
  }[];
}

export interface ConnectManifest {
  readonly generator: { readonly name: string; readonly version: string };
  readonly kind: typeof CONNECT_MANIFEST_KIND;
  readonly requirements: readonly ConnectRequirement[];
  readonly schemaVersion: typeof CONNECT_MANIFEST_VERSION;
}

export function createConnectManifest(input: {
  readonly generator: ConnectManifest['generator'];
  readonly requirements: readonly ConnectRequirement[];
}): ConnectManifest {
  return {
    generator: input.generator,
    kind: CONNECT_MANIFEST_KIND,
    requirements: input.requirements,
    schemaVersion: CONNECT_MANIFEST_VERSION,
  };
}
