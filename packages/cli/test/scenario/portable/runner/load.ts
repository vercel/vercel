/**
 * Loads generated artifacts. The generator builds them in memory from the Zod
 * sources; the TS runner reads only the serialized artifacts (the same bytes
 * `pnpm scenarios:generate` exports for other runners), never the authoring
 * modules. This file is the only runner module allowed to import the generator.
 */
import type { z } from 'zod';
import { generateArtifacts } from '../generate';
import {
  faultsCatalogSchema,
  manifestSchema,
  operationsCatalogSchema,
  scenarioSchema,
  vectorSchema,
  type FaultsCatalog,
  type Manifest,
  type OperationsCatalog,
  type Scenario,
  type Vector,
} from '../model/schemas';

let cachedArtifacts: Map<string, string> | undefined;

function artifacts(): Map<string, string> {
  cachedArtifacts ??= generateArtifacts();
  return cachedArtifacts;
}

function loadJson<T>(schema: z.ZodType<T>, relativePath: string): T {
  const content = artifacts().get(relativePath);
  if (content === undefined) {
    throw new Error(`No generated artifact at ${relativePath}`);
  }
  return schema.parse(JSON.parse(content));
}

export function loadManifest(): Manifest {
  return loadJson(manifestSchema, 'manifest.json');
}

export function loadOperationsCatalog(): OperationsCatalog {
  return loadJson(operationsCatalogSchema, 'catalog/operations.json');
}

export function loadFaultsCatalog(): FaultsCatalog {
  return loadJson(faultsCatalogSchema, 'catalog/faults.json');
}

export function loadScenario(relativePath: string): Scenario {
  return loadJson(scenarioSchema, relativePath);
}

export function loadVector(relativePath: string): Vector {
  return loadJson(vectorSchema, relativePath);
}
