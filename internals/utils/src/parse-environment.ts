import type { ProjectEnvTarget } from "@vercel-internals/types";
import { isValidEnvTarget, getEnvTargetPlaceholder } from "./env/env-target";

export function parseEnvironment(
  environment = 'development'
): ProjectEnvTarget {
  if (!isValidEnvTarget(environment)) {
    throw new Error(
      `environment "${environment}" not supported; must be one of ${getEnvTargetPlaceholder()}`
    );
  }
  return environment;
}
