import {
  createConnectManifest,
  type ConnectManifest,
  type ConnectRequirement,
  type ConnectSubjectType,
  type JsonObject,
} from './connect-manifest.js';
import { RFC_7591_MANIFEST } from './provider-manifest.js';

const EVE_SNAPSHOT_KIND = 'eve-external-resources';
const EVE_SNAPSHOT_VERSION = 1;

interface CredentialRequirement {
  readonly method?: string;
  readonly reference: string;
  readonly service: string;
  readonly subjectTypes: readonly ConnectSubjectType[];
}

interface ConnectionResource {
  readonly credentials: CredentialRequirement;
  readonly protocol:
    | { readonly type: 'mcp'; readonly url: string }
    | { readonly type: 'openapi'; readonly url: string };
  readonly kind: 'connection';
  readonly logicalPath: string;
  readonly name: string;
}

interface ChannelResource {
  readonly credentials: CredentialRequirement;
  readonly kind: 'channel';
  readonly logicalPath: string;
  readonly manifest: JsonObject;
  readonly name: string;
  readonly route: { readonly path: string };
}

type Resource = ChannelResource | ConnectionResource;

interface EveSnapshot {
  readonly generator: { readonly name: 'eve'; readonly version: string };
  readonly kind: typeof EVE_SNAPSHOT_KIND;
  readonly resources: readonly Resource[];
  readonly schemaVersion: typeof EVE_SNAPSHOT_VERSION;
}

export function createConnectManifestFromEve(input: unknown): ConnectManifest {
  const snapshot = parseEveSnapshot(input);
  return createConnectManifest({
    generator: snapshot.generator,
    requirements: collectConnectRequirements(snapshot.resources),
  });
}

function collectConnectRequirements(
  resources: readonly Resource[]
): readonly ConnectRequirement[] {
  const requirements = new Map<string, ConnectRequirement>();
  for (const resource of resources) {
    const next = toConnectRequirement(resource);
    const current = requirements.get(next.target);
    if (current === undefined) {
      requirements.set(next.target, next);
      continue;
    }
    assertCompatibleRequirements(current, next);
    requirements.set(next.target, {
      ...current,
      interfaces: appendDistinct(current.interfaces, next.interfaces),
      triggers: appendDistinct(current.triggers, next.triggers),
      uses: appendDistinct(current.uses, next.uses),
    });
  }
  return [...requirements.values()];
}

function assertCompatibleRequirements(
  current: ConnectRequirement,
  next: ConnectRequirement
): void {
  const target = current.target;
  if (current.connect.service !== next.connect.service) {
    throw conflictingRequirement(target, 'service');
  }
  if (current.connect.type !== next.connect.type) {
    throw conflictingRequirement(target, 'method');
  }
  if (
    canonicalJson([...current.connect.subjectTypes].sort()) !==
    canonicalJson([...next.connect.subjectTypes].sort())
  ) {
    throw conflictingRequirement(target, 'subjectTypes');
  }
  if (
    canonicalJson(current.connect.manifest) !==
    canonicalJson(next.connect.manifest)
  ) {
    throw conflictingRequirement(target, 'provider manifest');
  }
}

function conflictingRequirement(target: string, field: string): Error {
  return new Error(
    `Conflicting declarations for credential target "${target}": ${field} must agree.`
  );
}

function appendDistinct<T>(
  current: readonly T[],
  additional: readonly T[]
): readonly T[] {
  const seen = new Set(current.map(value => canonicalJson(value)));
  return [
    ...current,
    ...additional.filter(value => {
      const key = canonicalJson(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function toConnectRequirement(resource: Resource): ConnectRequirement {
  return {
    connect: {
      manifest:
        resource.kind === 'channel' ? resource.manifest : RFC_7591_MANIFEST,
      service: resource.credentials.service,
      subjectTypes: resource.credentials.subjectTypes,
      ...(resource.credentials.method === undefined
        ? {}
        : { type: resource.credentials.method }),
    },
    interfaces:
      resource.kind === 'connection'
        ? [{ protocol: resource.protocol.type, url: resource.protocol.url }]
        : [],
    target: resource.credentials.reference,
    triggers: resource.kind === 'channel' ? [resource.route] : [],
    uses: [
      {
        kind: resource.kind,
        logicalPath: resource.logicalPath,
        name: resource.name,
      },
    ],
  };
}

function parseEveSnapshot(input: unknown): EveSnapshot {
  const snapshot = record(input, 'snapshot');
  if (
    snapshot.kind !== EVE_SNAPSHOT_KIND ||
    snapshot.schemaVersion !== EVE_SNAPSHOT_VERSION
  ) {
    throw new Error(
      'Expected an eve-external-resources snapshot with schemaVersion 1.'
    );
  }
  const generator = record(snapshot.generator, 'snapshot.generator');
  if (generator.name !== 'eve')
    throw new Error('Expected snapshot.generator.name to be "eve".');
  const version = nonEmptyString(
    generator.version,
    'snapshot.generator.version'
  );
  if (!Array.isArray(snapshot.resources))
    throw new Error('Expected snapshot.resources to be an array.');
  return {
    generator: { name: 'eve', version },
    kind: EVE_SNAPSHOT_KIND,
    resources: snapshot.resources.map((value, index) =>
      parseResource(value, index)
    ),
    schemaVersion: EVE_SNAPSHOT_VERSION,
  };
}

function parseResource(value: unknown, index: number): Resource {
  const path = `snapshot.resources[${index}]`;
  const resource = record(value, path);
  const kind = resource.kind;
  if (kind !== 'channel' && kind !== 'connection') {
    throw new Error(`Expected ${path}.kind to be "channel" or "connection".`);
  }
  const common = {
    credentials: parseCredentials(resource.credentials, `${path}.credentials`),
    logicalPath: nonEmptyString(resource.logicalPath, `${path}.logicalPath`),
    name: nonEmptyString(resource.name, `${path}.name`),
  };
  if (kind === 'connection') {
    const protocol = record(resource.protocol, `${path}.protocol`);
    const type = protocol.type;
    if (type !== 'mcp' && type !== 'openapi') {
      throw new Error(
        `Expected ${path}.protocol.type to be "mcp" or "openapi".`
      );
    }
    return {
      ...common,
      kind,
      protocol: {
        type,
        url: nonEmptyString(protocol.url, `${path}.protocol.url`),
      },
    };
  }
  const route = record(resource.route, `${path}.route`);
  return {
    ...common,
    kind,
    logicalPath: common.logicalPath,
    manifest: jsonObject(resource.manifest, `${path}.manifest`),
    name: common.name,
    route: { path: nonEmptyString(route.path, `${path}.route.path`) },
  };
}

function parseCredentials(value: unknown, path: string): CredentialRequirement {
  const credentials = record(value, path);
  if (
    !Array.isArray(credentials.subjectTypes) ||
    credentials.subjectTypes.length === 0
  ) {
    throw new Error(`Expected ${path}.subjectTypes to be a non-empty array.`);
  }
  const subjectTypes = credentials.subjectTypes.map((value, index) => {
    if (value !== 'app' && value !== 'user') {
      throw new Error(
        `Expected ${path}.subjectTypes[${index}] to be "app" or "user".`
      );
    }
    return value;
  });
  const method = optionalNonEmptyString(credentials.method, `${path}.method`);
  return {
    ...(method === undefined ? {} : { method }),
    reference: nonEmptyString(credentials.reference, `${path}.reference`),
    service: nonEmptyString(credentials.service, `${path}.service`),
    subjectTypes,
  };
}

function jsonObject(value: unknown, path: string): JsonObject {
  const parsed = JSON.parse(JSON.stringify(value)) as unknown;
  return record(parsed, path) as JsonObject;
}

function optionalNonEmptyString(
  value: unknown,
  path: string
): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value, path);
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected ${path} to be a non-empty string.`);
  }
  return value;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${path} to be an object.`);
  }
  return value as Record<string, unknown>;
}
