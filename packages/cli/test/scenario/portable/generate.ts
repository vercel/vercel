/**
 * Pure generator: validates authored scenarios/vectors and builds every
 * portable artifact in memory. It derives structure (defaults,
 * references, merge patches, canonical form) but never expected answers.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { catalog as defaultCatalog } from './catalog';
import { whoamiScenarios } from './cases/whoami.scenarios';
import { fakeApiVectors } from './vectors/fake-api.vectors';
import {
  applyMergePatch,
  canonicalJson,
  isJsonObject,
  type Json,
} from './model/json';
import {
  FORMAT_VERSION,
  GENERATOR,
  LOCAL_STATE_KEYS,
  authoredScenarioSchema,
  authoredVectorSchema,
  authoredWorldSchema,
  capabilitiesCatalogSchema,
  conditionsSchema,
  errorsCatalogSchema,
  faultsCatalogSchema,
  manifestSchema,
  operationsCatalogSchema,
  scenarioSchema,
  vectorSchema,
  worldSchema,
  type AuthoredScenario,
  type AuthoredVector,
  type Catalog,
  type Conditions,
  type Manifest,
  type OperationLogEntry,
  type Scenario,
  type Vector,
  type World,
} from './model/schemas';

export class GeneratorError extends Error {}

export interface GeneratorInput {
  scenarios: AuthoredScenario[];
  vectors: AuthoredVector[];
  catalog: Catalog;
}

export function defaultGeneratorInput(): GeneratorInput {
  return {
    scenarios: whoamiScenarios,
    vectors: fakeApiVectors,
    catalog: defaultCatalog,
  };
}

function has(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function fail(where: string, message: string): never {
  throw new GeneratorError(`${where}: ${message}`);
}

function parse<T>(schema: z.ZodType<T>, value: unknown, where: string): T {
  const result = schema.safeParse(value);
  if (!result.success) fail(where, z.prettifyError(result.error));
  return result.data;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * SAML errors carrying `teamId` make `Client.fetch` start reauthentication,
 * which can open a real browser. Reject anything that looks like one.
 */
export function assertNoReauthTrigger(body: unknown, where: string): void {
  if (Array.isArray(body)) {
    body.forEach((item, i) => assertNoReauthTrigger(item, `${where}[${i}]`));
    return;
  }
  if (!isJsonObject(body)) return;
  for (const [key, value] of Object.entries(body)) {
    if (key === 'teamId' || key === 'saml') {
      fail(where, `error bodies must not contain "${key}" (reauth trigger)`);
    }
    if (key === 'code' && typeof value === 'string' && /saml/i.test(value)) {
      fail(where, `error code "${value}" is a SAML reauth trigger`);
    }
    assertNoReauthTrigger(value, `${where}.${key}`);
  }
}

export function validateCatalog(catalog: Catalog): void {
  for (const [id, fault] of Object.entries(catalog.faults.faults)) {
    assertNoReauthTrigger(fault.body, `fault ${id}`);
  }
  for (const [id, operation] of Object.entries(catalog.operations.operations)) {
    for (const capability of operation.requires) {
      if (!has(catalog.capabilities.capabilities, capability)) {
        fail(`operation ${id}`, `unknown capability "${capability}"`);
      }
    }
    for (const [principal, spec] of Object.entries(operation.responses)) {
      if (spec?.kind === 'literal') {
        assertNoReauthTrigger(spec.body, `operation ${id} ${principal}`);
      }
      if (spec?.kind === 'world' && spec.otherwise) {
        assertNoReauthTrigger(
          spec.otherwise.body,
          `operation ${id} ${principal}`
        );
      }
    }
  }
}

export function validateWorld(world: World, where: string): void {
  const { users, teams, teamOrder, memberships, apps, tokens } = world.server;
  for (const [key, user] of Object.entries(users)) {
    if (user.id !== key) fail(where, `users.${key} has id "${user.id}"`);
  }
  for (const [key, team] of Object.entries(teams)) {
    if (team.id !== key) fail(where, `teams.${key} has id "${team.id}"`);
  }
  const teamIds = Object.keys(teams);
  if (
    teamOrder.length !== teamIds.length ||
    new Set(teamOrder).size !== teamOrder.length ||
    !teamOrder.every(id => has(teams, id))
  ) {
    fail(where, 'server.teamOrder must be a permutation of the teams keys');
  }
  for (const [userId, byTeam] of Object.entries(memberships)) {
    if (!has(users, userId)) fail(where, `membership user "${userId}" unknown`);
    for (const teamId of Object.keys(byTeam)) {
      if (!has(teams, teamId)) {
        fail(where, `membership team "${teamId}" unknown`);
      }
    }
  }
  for (const [appId, app] of Object.entries(apps)) {
    if (!has(teams, app.teamId)) {
      fail(where, `apps.${appId}.teamId "${app.teamId}" unknown`);
    }
  }
  for (const [token, { principal }] of Object.entries(tokens)) {
    const pool = principal.kind === 'user' ? users : apps;
    if (!has(pool, principal.id)) {
      fail(where, `token "${token}" principal ${principal.kind} unknown`);
    }
  }

  const { credentials, settings, projectLink } = world.local;
  if (credentials && has(credentials, 'refreshToken')) {
    fail(where, 'local.credentials must not contain a refreshToken');
  }
  const currentTeam = settings?.currentTeam;
  if (typeof currentTeam === 'string' && !has(teams, currentTeam)) {
    fail(where, `local.settings.currentTeam "${currentTeam}" unknown`);
  }
  const orgId = projectLink?.orgId;
  if (typeof orgId === 'string' && !has(teams, orgId) && !has(users, orgId)) {
    fail(where, `local.projectLink.orgId "${orgId}" unknown`);
  }
}

function normalizeWorld(authored: unknown, where: string): World {
  const parsed = parse(authoredWorldSchema, authored, where);
  const world = parse(
    worldSchema,
    {
      ...parsed,
      server: {
        ...parsed.server,
        teamOrder: parsed.server.teamOrder ?? Object.keys(parsed.server.teams),
      },
    },
    where
  );
  validateWorld(world, where);
  return world;
}

function buildConditions(
  authored: { faults?: Record<string, string> } | undefined,
  catalog: Catalog,
  where: string
): Conditions {
  const conditions = parse(
    conditionsSchema,
    { faults: authored?.faults ?? {} },
    where
  );
  for (const [operation, fault] of Object.entries(conditions.faults)) {
    if (!has(catalog.operations.operations, operation)) {
      fail(where, `fault targets unknown operation "${operation}"`);
    }
    if (!has(catalog.faults.faults, fault)) {
      fail(where, `unknown fault "${fault}"`);
    }
  }
  return conditions;
}

function validateOperationEntry(
  entry: OperationLogEntry,
  catalog: Catalog,
  where: string
): void {
  if (!has(catalog.operations.operations, entry.operation)) {
    fail(where, `unknown operation "${entry.operation}"`);
  }
  const operation = catalog.operations.operations[entry.operation];
  const expectedParams = [...operation.params].sort().join(',');
  const actualParams = Object.keys(entry.params ?? {})
    .sort()
    .join(',');
  if (operation.params.length === 0 && entry.params !== undefined) {
    fail(where, `${entry.operation} takes no params`);
  }
  if (expectedParams !== actualParams) {
    fail(where, `${entry.operation} params must be [${expectedParams}]`);
  }
  if (operation.recordsTeamId !== (entry.teamId !== undefined)) {
    fail(
      where,
      `${entry.operation} ${operation.recordsTeamId ? 'requires' : 'must not have'} teamId`
    );
  }
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** Applies the authored merge patch; removed local files normalize to null. */
function expectedWorldAfter(
  world: World,
  patch: Record<string, Json>,
  where: string
): World {
  const patched = applyMergePatch(world, patch);
  if (!isJsonObject(patched) || !isJsonObject(patched.local)) {
    fail(where, 'worldAfter must keep `local` an object');
  }
  for (const key of LOCAL_STATE_KEYS) {
    if (!has(patched.local, key)) patched.local[key] = null;
  }
  const after = parse(worldSchema, patched, `${where} worldAfter`);
  validateWorld(after, `${where} worldAfter`);
  return after;
}

export function buildScenario(
  authoredInput: AuthoredScenario,
  catalog: Catalog
): Scenario {
  const where = `scenario ${authoredInput.id}`;
  const authored = parse(authoredScenarioSchema, authoredInput, where);
  const world = normalizeWorld(authored.world, where);
  const requires = authored.requires ?? [];
  if (new Set(requires).size !== requires.length) {
    fail(where, 'requires contains duplicates');
  }
  for (const capability of requires) {
    if (!has(catalog.capabilities.capabilities, capability)) {
      fail(where, `unknown capability "${capability}"`);
    }
  }
  const conditions = buildConditions(authored.conditions, catalog, where);

  for (const entry of authored.expect.operations.log) {
    validateOperationEntry(entry, catalog, where);
    for (const capability of catalog.operations.operations[entry.operation]
      .requires) {
      if (!requires.includes(capability)) {
        fail(where, `${entry.operation} requires capability "${capability}"`);
      }
    }
  }

  const { outcome } = authored.expect;
  let exitCode = 0;
  let stderrContains: string[] = [];
  if (outcome.kind === 'error') {
    if (!has(catalog.errors.errors, outcome.error)) {
      fail(where, `unknown error "${outcome.error}"`);
    }
    const error = catalog.errors.errors[outcome.error];
    exitCode = error.exitCode;
    stderrContains = [...error.stderrContains];
  }

  return parse(
    scenarioSchema,
    {
      formatVersion: FORMAT_VERSION,
      id: authored.id,
      summary: authored.summary,
      requires,
      world,
      conditions,
      invoke: authored.invoke,
      expect: {
        outcome,
        exitCode,
        stdout: authored.expect.stdout,
        stderrContains,
        operations: authored.expect.operations,
        world: expectedWorldAfter(world, authored.expect.worldAfter, where),
      },
    },
    where
  );
}

export function buildVector(
  authoredInput: AuthoredVector,
  catalog: Catalog
): Vector {
  const where = `vector ${authoredInput.id}`;
  const authored = parse(authoredVectorSchema, authoredInput, where);
  const world = normalizeWorld(authored.world, where);
  const conditions = buildConditions(authored.conditions, catalog, where);
  if (authored.expect.operation) {
    validateOperationEntry(authored.expect.operation, catalog, where);
  }
  return parse(
    vectorSchema,
    {
      formatVersion: FORMAT_VERSION,
      id: authored.id,
      summary: authored.summary,
      world,
      conditions,
      request: {
        ...authored.request,
        query: authored.request.query ?? {},
        headers: authored.request.headers ?? {},
      },
      expect: authored.expect,
    },
    where
  );
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

const jsonSchemas: Record<string, z.ZodType> = {
  'schema/capabilities.schema.json': capabilitiesCatalogSchema,
  'schema/errors.schema.json': errorsCatalogSchema,
  'schema/faults.schema.json': faultsCatalogSchema,
  'schema/manifest.schema.json': manifestSchema,
  'schema/operations.schema.json': operationsCatalogSchema,
  'schema/scenario.schema.json': scenarioSchema,
  'schema/vector.schema.json': vectorSchema,
  'schema/world.schema.json': worldSchema,
};

export function scenarioPath(id: string): string {
  return `scenarios/${id}.json`;
}

export function vectorPath(id: string): string {
  return `fake-api-vectors/${id.slice(id.indexOf('/') + 1)}.json`;
}

export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function assertUniqueIds(ids: string[], kind: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail(kind, `duplicate id "${id}"`);
    seen.add(id);
  }
}

/** Builds every generated file as `relativePath -> canonical content`. */
export function generateArtifacts(
  input: GeneratorInput = defaultGeneratorInput()
): Map<string, string> {
  const { catalog } = input;
  validateCatalog(catalog);
  assertUniqueIds(
    input.scenarios.map(s => s.id),
    'scenarios'
  );
  assertUniqueIds(
    input.vectors.map(v => v.id),
    'vectors'
  );

  const files = new Map<string, string>();
  const add = (path: string, value: unknown) => {
    files.set(path, canonicalJson(value));
  };

  add(
    'catalog/capabilities.json',
    parse(capabilitiesCatalogSchema, catalog.capabilities, 'capabilities')
  );
  add(
    'catalog/errors.json',
    parse(errorsCatalogSchema, catalog.errors, 'errors')
  );
  add(
    'catalog/faults.json',
    parse(faultsCatalogSchema, catalog.faults, 'faults')
  );
  add(
    'catalog/operations.json',
    parse(operationsCatalogSchema, catalog.operations, 'operations')
  );
  for (const [path, schema] of Object.entries(jsonSchemas)) {
    add(path, z.toJSONSchema(schema));
  }

  const scenarios = input.scenarios.map(authored => {
    const scenario = buildScenario(authored, catalog);
    const path = scenarioPath(scenario.id);
    add(path, scenario);
    return { id: scenario.id, path };
  });
  const vectors = input.vectors.map(authored => {
    const vector = buildVector(authored, catalog);
    const path = vectorPath(vector.id);
    if (files.has(path)) fail(`vector ${vector.id}`, `path collision ${path}`);
    add(path, vector);
    return { id: vector.id, path };
  });

  const manifest: Manifest = parse(
    manifestSchema,
    {
      formatVersion: FORMAT_VERSION,
      generator: GENERATOR,
      scenarios,
      vectors,
      files: [...files.keys()]
        .sort()
        .map(path => ({ path, sha256: sha256(files.get(path) as string) })),
    },
    'manifest'
  );
  add('manifest.json', manifest);

  return new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
