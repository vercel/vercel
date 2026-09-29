/**
 * Zod models for the portable scenario format. These schemas are the single
 * source of truth; the JSON Schemas (`schema/*.schema.json`) are derived.
 * Authored (TS-only) forms are ergonomic; generated forms are fully explicit.
 */
import { z } from 'zod';

export const FORMAT_VERSION = 1;
export const GENERATOR = 'vercel-cli-portable-scenarios@1';

const id = z.string().min(1);

export const jsonObjectSchema = z.record(z.string(), z.json());
export type JsonObject = z.infer<typeof jsonObjectSchema>;

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

/** Server entities are emitted by the fake API verbatim (null vs absent kept). */
export const userSchema = z
  .looseObject({ id, username: z.string() })
  .meta({ description: 'A user entity, served verbatim by `user.get`.' });
export type User = z.infer<typeof userSchema>;

export const teamSchema = z
  .looseObject({ id, slug: z.string() })
  .meta({ description: 'A team entity, served verbatim by team operations.' });
export type Team = z.infer<typeof teamSchema>;

export const membershipKindSchema = z.enum(['direct', 'virtual']);
export type MembershipKind = z.infer<typeof membershipKindSchema>;

export const appSchema = z.strictObject({
  clientId: z.string(),
  clientName: z.string(),
  teamId: id.meta({ description: 'The team the app token is bound to.' }),
});
export type App = z.infer<typeof appSchema>;

export const principalSchema = z.strictObject({
  kind: z.enum(['user', 'app']),
  id: id.meta({ description: 'Key into `users` or `apps`.' }),
});
export type Principal = z.infer<typeof principalSchema>;

export const tokenSchema = z.strictObject({ principal: principalSchema });

export const serverStateSchema = z.strictObject({
  users: z.record(z.string(), userSchema),
  teams: z.record(z.string(), teamSchema),
  teamOrder: z.array(id).meta({
    description:
      'Order of teams in `teams.list` responses. A permutation of the `teams` keys.',
  }),
  memberships: z
    .record(z.string(), z.record(z.string(), membershipKindSchema))
    .meta({ description: 'userId -> teamId -> membership kind.' }),
  apps: z.record(z.string(), appSchema),
  tokens: z
    .record(z.string(), tokenSchema)
    .meta({ description: 'Bearer token value -> principal.' }),
});
export type ServerState = z.infer<typeof serverStateSchema>;

export const localStateSchema = z.strictObject({
  credentials: jsonObjectSchema.nullable().meta({
    description:
      '`global-config/auth.json` without `//` comment keys; null when absent.',
  }),
  settings: jsonObjectSchema.nullable().meta({
    description: '`global-config/config.json`; null when absent.',
  }),
  projectLink: jsonObjectSchema.nullable().meta({
    description: '`workspace/.vercel/project.json`; null when absent.',
  }),
  repoLink: jsonObjectSchema.nullable().meta({
    description: '`workspace/.vercel/repo.json`; null when absent.',
  }),
});
export type LocalState = z.infer<typeof localStateSchema>;

export const LOCAL_STATE_KEYS = [
  'credentials',
  'settings',
  'projectLink',
  'repoLink',
] as const;

export const worldSchema = z.strictObject({
  server: serverStateSchema,
  local: localStateSchema,
});
export type World = z.infer<typeof worldSchema>;

/** Authored worlds may omit `teamOrder`; it defaults to insertion order. */
export const authoredWorldSchema = z.strictObject({
  server: serverStateSchema.extend({ teamOrder: z.array(id).optional() }),
  local: localStateSchema,
});
export type AuthoredWorld = z.infer<typeof authoredWorldSchema>;

// ---------------------------------------------------------------------------
// Scenario pieces
// ---------------------------------------------------------------------------

export const conditionsSchema = z.strictObject({
  faults: z
    .record(z.string(), id)
    .meta({ description: 'operation id -> fault id (catalog/faults.json).' }),
});
export type Conditions = z.infer<typeof conditionsSchema>;

export const invokeSchema = z.strictObject({
  argv: z.array(z.string()),
  token: z.string().nullable().meta({
    description: 'When non-null the runner appends `--token <value>`.',
  }),
});

export const outcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('success') }),
  z.strictObject({ kind: z.literal('error'), error: id }),
]);
export type Outcome = z.infer<typeof outcomeSchema>;

export const stdoutExpectationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('exact'), value: z.string() }),
  z.strictObject({ kind: z.literal('json'), value: z.json() }),
  z.strictObject({ kind: z.literal('empty') }),
]);
export type StdoutExpectation = z.infer<typeof stdoutExpectationSchema>;

export const operationLogEntrySchema = z.strictObject({
  operation: id,
  params: z.record(z.string(), z.string()).optional(),
  teamId: z.string().nullable().optional().meta({
    description:
      'The `teamId` query parameter or null. Present only when the operation has `recordsTeamId`.',
  }),
});
export type OperationLogEntry = z.infer<typeof operationLogEntrySchema>;

export const matchModeSchema = z.enum(['exact', 'unordered', 'subsequence']);
export type MatchMode = z.infer<typeof matchModeSchema>;

export const operationsExpectationSchema = z.strictObject({
  mode: matchModeSchema,
  log: z.array(operationLogEntrySchema),
});
export type OperationsExpectation = z.infer<typeof operationsExpectationSchema>;

export const SCENARIO_ID_PATTERN = /^[a-z0-9-]+\/[a-z0-9-]+$/;
const scenarioId = z.string().regex(SCENARIO_ID_PATTERN);

export const scenarioSchema = z
  .strictObject({
    formatVersion: z.literal(FORMAT_VERSION),
    id: scenarioId,
    summary: z.string(),
    requires: z.array(id),
    world: worldSchema,
    conditions: conditionsSchema,
    invoke: invokeSchema,
    expect: z.strictObject({
      outcome: outcomeSchema,
      exitCode: z.number().int(),
      stdout: stdoutExpectationSchema,
      stderrContains: z.array(z.string()),
      operations: operationsExpectationSchema,
      world: worldSchema.meta({
        description: 'The full expected world after.',
      }),
    }),
  })
  .meta({ title: 'Portable CLI scenario' });
export type Scenario = z.infer<typeof scenarioSchema>;

export const authoredScenarioSchema = z.strictObject({
  id: scenarioId,
  summary: z.string(),
  requires: z.array(id).optional(),
  world: authoredWorldSchema,
  conditions: conditionsSchema.partial().optional(),
  invoke: invokeSchema,
  expect: z.strictObject({
    outcome: outcomeSchema,
    stdout: stdoutExpectationSchema,
    operations: operationsExpectationSchema,
    /** RFC 7386 merge patch applied to `world` to produce the expected world. */
    worldAfter: jsonObjectSchema,
  }),
});
export type AuthoredScenario = z.input<typeof authoredScenarioSchema>;

// ---------------------------------------------------------------------------
// Fake API conformance vectors
// ---------------------------------------------------------------------------

export const vectorRequestSchema = z.strictObject({
  method: z.enum(['GET', 'POST']),
  path: z.string().startsWith('/'),
  query: z.record(z.string(), z.string()),
  headers: z.strictObject({ authorization: z.string().optional() }),
  body: z.record(z.string(), z.string()).optional().meta({
    description: 'Sent as application/x-www-form-urlencoded when present.',
  }),
});

export const vectorSchema = z
  .strictObject({
    formatVersion: z.literal(FORMAT_VERSION),
    id: scenarioId,
    summary: z.string(),
    world: worldSchema,
    conditions: conditionsSchema,
    request: vectorRequestSchema,
    expect: z.strictObject({
      status: z.number().int(),
      json: z.json().meta({
        description:
          'Response body. `{{origin}}` in strings is the API origin.',
      }),
      operation: operationLogEntrySchema.nullable().meta({
        description:
          'The operation-log entry recorded for this request, or null when unmodeled.',
      }),
    }),
  })
  .meta({ title: 'Portable fake API conformance vector' });
export type Vector = z.infer<typeof vectorSchema>;

export const authoredVectorSchema = z.strictObject({
  id: scenarioId,
  summary: z.string(),
  world: authoredWorldSchema,
  conditions: conditionsSchema.partial().optional(),
  request: vectorRequestSchema.extend({
    query: z.record(z.string(), z.string()).optional(),
    headers: z
      .strictObject({ authorization: z.string().optional() })
      .optional(),
  }),
  expect: vectorSchema.shape.expect,
});
export type AuthoredVector = z.input<typeof authoredVectorSchema>;

// ---------------------------------------------------------------------------
// Catalogs
// ---------------------------------------------------------------------------

export const principalKindSchema = z.enum(['user', 'app', 'none', 'unknown']);
export type PrincipalKind = z.infer<typeof principalKindSchema>;

export const literalResponseSchema = z.strictObject({
  status: z.number().int(),
  body: z.json(),
});
export type LiteralResponse = z.infer<typeof literalResponseSchema>;

export const responseSpecSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('literal'),
    ...literalResponseSchema.shape,
  }),
  z.strictObject({
    kind: z.literal('world'),
    status: z.number().int(),
    semantics: z.string(),
    otherwise: z
      .strictObject({ when: z.string(), ...literalResponseSchema.shape })
      .optional(),
  }),
  z.strictObject({ kind: z.literal('unmodeled') }),
]);
export type ResponseSpec = z.infer<typeof responseSpecSchema>;

export const operationSchema = z.strictObject({
  summary: z.string(),
  request: z.strictObject({
    method: z.enum(['GET', 'POST']),
    path: z.string().meta({ description: 'Path pattern; `:name` is a param.' }),
  }),
  auth: z.enum(['bearer', 'form-token', 'none']).meta({
    description:
      'How the principal is identified: Authorization header, form `token`, or not at all (principal kind `none`).',
  }),
  identity: z.boolean(),
  recordsTeamId: z.boolean(),
  params: z.array(z.string()),
  requires: z.array(id),
  responses: z.strictObject({
    user: responseSpecSchema.optional(),
    app: responseSpecSchema.optional(),
    none: responseSpecSchema.optional(),
    unknown: responseSpecSchema.optional(),
  }),
});
export type Operation = z.infer<typeof operationSchema>;

export const operationsCatalogSchema = z
  .strictObject({
    formatVersion: z.literal(FORMAT_VERSION),
    operations: z.record(z.string(), operationSchema),
  })
  .meta({ title: 'Operation catalog' });
export type OperationsCatalog = z.infer<typeof operationsCatalogSchema>;

export const faultSchema = z.strictObject({
  summary: z.string(),
  ...literalResponseSchema.shape,
});
export const faultsCatalogSchema = z
  .strictObject({
    formatVersion: z.literal(FORMAT_VERSION),
    faults: z.record(z.string(), faultSchema),
  })
  .meta({ title: 'Fault catalog' });
export type FaultsCatalog = z.infer<typeof faultsCatalogSchema>;

export const errorSchema = z.strictObject({
  summary: z.string(),
  exitCode: z.number().int(),
  stderrContains: z.array(z.string()),
});
export const errorsCatalogSchema = z
  .strictObject({
    formatVersion: z.literal(FORMAT_VERSION),
    errors: z.record(z.string(), errorSchema),
  })
  .meta({ title: 'Error catalog' });
export type ErrorsCatalog = z.infer<typeof errorsCatalogSchema>;

export const capabilitySchema = z.strictObject({
  summary: z.string(),
  mechanism: z.string(),
});
export const capabilitiesCatalogSchema = z
  .strictObject({
    formatVersion: z.literal(FORMAT_VERSION),
    capabilities: z.record(z.string(), capabilitySchema),
  })
  .meta({ title: 'Capability catalog' });
export type CapabilitiesCatalog = z.infer<typeof capabilitiesCatalogSchema>;

export interface Catalog {
  operations: OperationsCatalog;
  faults: FaultsCatalog;
  errors: ErrorsCatalog;
  capabilities: CapabilitiesCatalog;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

const indexEntry = z.strictObject({ id: scenarioId, path: z.string() });

export const manifestSchema = z
  .strictObject({
    formatVersion: z.literal(FORMAT_VERSION),
    generator: z.string(),
    scenarios: z.array(indexEntry),
    vectors: z.array(indexEntry),
    files: z.array(
      z.strictObject({ path: z.string(), sha256: z.string().length(64) })
    ),
  })
  .meta({ title: 'Portable scenario manifest' });
export type Manifest = z.infer<typeof manifestSchema>;
