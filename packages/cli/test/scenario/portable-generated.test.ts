import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  GeneratorError,
  buildScenario,
  defaultGeneratorInput,
  generateArtifacts,
  sha256,
  validateCatalog,
} from './portable/generate';
import { applyMergePatch, canonicalJson } from './portable/model/json';
import {
  capabilitiesCatalogSchema,
  errorsCatalogSchema,
  faultsCatalogSchema,
  manifestSchema,
  operationsCatalogSchema,
  scenarioSchema,
  vectorSchema,
  type AuthoredScenario,
} from './portable/model/schemas';

const scenarioDir = dirname(fileURLToPath(import.meta.url));
const portableDir = join(scenarioDir, 'portable');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function toPosix(dir: string, file: string): string {
  return relative(dir, file).split(sep).join('/');
}

describe('generated portable artifacts', () => {
  const artifacts = generateArtifacts();

  it('are deterministic', () => {
    expect([...generateArtifacts()]).toEqual([...artifacts]);
  });

  it('validate against their schemas and are canonical', () => {
    const schemaFor = (path: string): z.ZodType | undefined => {
      if (path.startsWith('scenarios/')) return scenarioSchema;
      if (path.startsWith('fake-api-vectors/')) return vectorSchema;
      return {
        'manifest.json': manifestSchema,
        'catalog/capabilities.json': capabilitiesCatalogSchema,
        'catalog/errors.json': errorsCatalogSchema,
        'catalog/faults.json': faultsCatalogSchema,
        'catalog/operations.json': operationsCatalogSchema,
      }[path];
    };
    for (const [path, content] of artifacts) {
      const value = JSON.parse(content);
      expect(canonicalJson(value), `${path} is not canonical`).toBe(content);
      const schema = schemaFor(path);
      if (schema) schema.parse(value);
      else expect(path).toMatch(/^schema\/[a-z]+\.schema\.json$/);
    }
  });

  it('have manifest hashes for every other file', () => {
    const manifest = manifestSchema.parse(
      JSON.parse(artifacts.get('manifest.json') as string)
    );
    const files = [...artifacts.keys()]
      .filter(path => path !== 'manifest.json')
      .sort();
    expect(manifest.files.map(file => file.path)).toEqual(files);
    for (const { path, sha256: hash } of manifest.files) {
      expect(sha256(artifacts.get(path) as string), path).toBe(hash);
    }
    for (const { path } of [...manifest.scenarios, ...manifest.vectors]) {
      expect(files).toContain(path);
    }
  });
});

describe('applyMergePatch (RFC 7386)', () => {
  // Examples from RFC 7386 Appendix A.
  it.each([
    [{ a: 'b' }, { a: 'c' }, { a: 'c' }],
    [{ a: 'b' }, { b: 'c' }, { a: 'b', b: 'c' }],
    [{ a: 'b' }, { a: null }, {}],
    [{ a: 'b', b: 'c' }, { a: null }, { b: 'c' }],
    [{ a: ['b'] }, { a: 'c' }, { a: 'c' }],
    [{ a: 'c' }, { a: ['b'] }, { a: ['b'] }],
    [{ a: { b: 'c' } }, { a: { b: 'd', c: null } }, { a: { b: 'd' } }],
    [{ a: [{ b: 'c' }] }, { a: [1] }, { a: [1] }],
    [
      ['a', 'b'],
      ['c', 'd'],
      ['c', 'd'],
    ],
    [{ a: 'b' }, ['c'], ['c']],
    [{ a: 'foo' }, null, null],
    [{ a: 'foo' }, 'bar', 'bar'],
    [{ e: null }, { a: 1 }, { e: null, a: 1 }],
    [[1, 2], { a: 'b', c: null }, { a: 'b' }],
    [{}, { a: { bb: { ccc: null } } }, { a: { bb: {} } }],
  ])('%j + %j', (target, patch, expected) => {
    const before = structuredClone(target);
    expect(applyMergePatch(target, patch)).toEqual(expected);
    expect(target).toEqual(before);
  });
});

describe('generator validation', () => {
  const { catalog, scenarios } = defaultGeneratorInput();
  const base = scenarios.find(s => s.id === 'whoami/personal-json');
  if (!base) throw new Error('missing base scenario');

  function variant(change: (s: AuthoredScenario) => void): AuthoredScenario {
    const copy = structuredClone(base as AuthoredScenario);
    change(copy);
    return copy;
  }

  it.each<[string, (s: AuthoredScenario) => void, RegExp]>([
    [
      'refresh tokens in credentials',
      s => {
        s.world.local.credentials = { token: 't', refreshToken: 'r' };
      },
      /refreshToken/,
    ],
    [
      'unknown membership team',
      s => {
        s.world.server.memberships.user_scenario = { team_missing: 'direct' };
      },
      /membership team "team_missing" unknown/,
    ],
    [
      'unknown fault',
      s => {
        s.conditions = { faults: { 'teams.list': 'nope' } };
      },
      /unknown fault "nope"/,
    ],
    [
      'unknown error',
      s => {
        s.expect.outcome = { kind: 'error', error: 'nope' };
      },
      /unknown error "nope"/,
    ],
    [
      'missing capability for an operation',
      s => {
        s.expect.operations.log.push({ operation: 'oauth.discovery' });
      },
      /requires capability "oauth-test-issuer"/,
    ],
    [
      'team.get without teamId',
      s => {
        s.expect.operations.log.push({
          operation: 'team.get',
          params: { idOrSlug: 'x' },
        });
      },
      /team.get requires teamId/,
    ],
    [
      'a worldAfter patch that breaks references',
      s => {
        s.expect.worldAfter = { local: { settings: { currentTeam: 'x' } } };
      },
      /currentTeam "x" unknown/,
    ],
  ])('rejects %s', (_name, change, message) => {
    expect(() => buildScenario(variant(change), catalog)).toThrow(message);
  });

  it('normalizes a deleted local file to null', () => {
    const scenario = buildScenario(
      variant(s => {
        s.expect.worldAfter = { local: { repoLink: null } };
      }),
      catalog
    );
    expect(scenario.expect.world.local.repoLink).toBeNull();
  });

  it('rejects SAML or teamId fault bodies', () => {
    const saml = structuredClone(catalog);
    saml.faults.faults.client_error.body = {
      error: { code: 'saml_required', message: 'SSO' },
    };
    expect(() => validateCatalog(saml)).toThrow(GeneratorError);
    const withTeamId = structuredClone(catalog);
    withTeamId.faults.faults.client_error.body = {
      error: { code: 'bad_request', message: 'x', teamId: 'team_global' },
    };
    expect(() => validateCatalog(withTeamId)).toThrow(/teamId/);
  });
});

describe('portable runner boundary', () => {
  // The runner reads only serialized artifacts. `runner/load.ts` is the one
  // module allowed to call the generator (and nothing else upstream of it).
  it('never imports authoring, cases, catalog source, vectors, or the generator', () => {
    const forbidden = ['authoring', 'cases', 'catalog', 'vectors'].map(dir =>
      join(portableDir, dir)
    );
    const generator = join(portableDir, 'generate');
    const generatorCli = join(portableDir, 'generate-cli');
    const loader = join(portableDir, 'runner', 'load.ts');
    const consumers = [
      ...listFiles(join(portableDir, 'runner')),
      join(scenarioDir, 'portable.test.ts'),
      join(scenarioDir, 'fake-api-vectors.test.ts'),
    ];
    const isFile = (target: string, path: string) =>
      target === path || target === `${path}.ts`;
    for (const file of consumers) {
      const source = readFileSync(file, 'utf8');
      for (const [, specifier] of source.matchAll(
        /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
      )) {
        if (!specifier.startsWith('.')) continue;
        const target = resolve(dirname(file), specifier);
        const violates =
          forbidden.some(
            dir => target === dir || target.startsWith(dir + sep)
          ) ||
          isFile(target, generatorCli) ||
          (isFile(target, generator) && file !== loader);
        expect(
          violates,
          `${toPosix(scenarioDir, file)} imports ${specifier}`
        ).toBe(false);
      }
    }
  });
});
