import type { Project } from '@vercel-internals/types';
import type Client from '../client';
import { getCustomEnvironments } from '../target/get-custom-environments';
import {
  VALID_ENVIRONMENTS,
  validateEnvironments,
} from './post-provision-setup';

type ProjectIdentity = Pick<Project, 'id' | 'name'>;

type ResolveProjectEnvironmentsResult =
  | { valid: true; environments: string[] }
  | { valid: false; error: string };

export async function resolveProjectEnvironments(
  client: Client,
  project: ProjectIdentity | undefined,
  requestedEnvironments: string[]
): Promise<ResolveProjectEnvironmentsResult> {
  const seenInputs = new Set<string>();
  for (const input of requestedEnvironments) {
    if (seenInputs.has(input)) {
      return {
        valid: false,
        error: `Duplicate environment selection: "${input}" was specified more than once. Specify each environment only once.`,
      };
    }
    seenInputs.add(input);
  }

  const validation = validateEnvironments(requestedEnvironments);
  const customEnvironmentInputs = validation.valid ? [] : validation.invalid;
  const customEnvironments =
    project && customEnvironmentInputs.length > 0
      ? await getCustomEnvironments(client, project.id)
      : [];

  const customEnvironmentByInput = new Map<string, string>();
  for (const environment of customEnvironments) {
    customEnvironmentByInput.set(environment.slug, environment.id);
    customEnvironmentByInput.set(environment.id, environment.id);
  }

  const invalid: string[] = [];
  const resolved: { input: string; value: string }[] = [];
  for (const input of requestedEnvironments) {
    const value = validateEnvironments([input]).valid
      ? input
      : customEnvironmentByInput.get(input);
    if (value === undefined) {
      invalid.push(input);
    } else {
      resolved.push({ input, value });
    }
  }

  if (invalid.length > 0) {
    const projectGuidance = project
      ? `, or a Custom Environment slug or ID from project ${project.name}`
      : '. Custom Environment slugs and IDs require a linked project';
    return {
      valid: false,
      error: `Invalid environment value: ${invalid.map(environment => `"${environment}"`).join(', ')}. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}${projectGuidance}.`,
    };
  }

  const firstInputByEnvironment = new Map<string, string>();
  for (const environment of resolved) {
    const firstInput = firstInputByEnvironment.get(environment.value);
    if (firstInput !== undefined) {
      return {
        valid: false,
        error: `Duplicate environment selection: "${firstInput}" and "${environment.input}" refer to the same environment. Specify each environment only once.`,
      };
    }
    firstInputByEnvironment.set(environment.value, environment.input);
  }

  return {
    valid: true,
    environments: resolved.map(environment => environment.value),
  };
}
