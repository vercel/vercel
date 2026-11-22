import type { Config, ServiceRuntime } from '@vercel/build-utils';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PinnedBuildpack } from './distribution';
import { go } from './go';
import { ruby } from './ruby';
import { rust } from './rust';

export interface BuildpackRuntime {
  /**
   * Runtime slug. Project detection routes a project here by setting
   * `config.buildpack` to this value. The buildpack detect function
   * classifies the application from its sources.
   */
  runtime: ServiceRuntime;
  /** Any one of these files marks a project the buildpack can build. */
  projectMarkers: readonly string[];
  /** The CNB order group, in order. Each entry is fetched from the mirror. */
  buildpacks: readonly PinnedBuildpack[];
  /**
   * Resolve the runtime version and complete build and run image references
   * from the staged service sources.
   */
  resolveImage(workPath: string): Promise<RuntimeImage>;
  /**
   * Validate the staged service sources against the project's build env
   * before any build work begins. Throws to fail the build.
   */
  validate?(params: {
    workPath: string;
    buildEnv?: Record<string, string>;
  }): void;
  /**
   * The root-relative program to build when a service or zero-config app
   * configures none, chosen from the staged sources as the runtime's own
   * builder chooses it. Return `undefined` to let the buildpack discover the
   * program, or throw to fail the build.
   */
  defaultEntrypoint?(params: {
    workPath: string;
    zeroConfig: boolean;
  }): string | undefined;
}

export interface RuntimeImage {
  version: string;
  buildImage: string;
  runImage: string;
}

/** Every buildpack-backed runtime the container builder can select. */
export const BUILDPACKS: readonly BuildpackRuntime[] = [ruby, go, rust];

/**
 * The buildpack `config.buildpack` names, if any. This is the only selector:
 * the platform will set it from the project's framework or the service's
 * runtime.
 */
export function requestedBuildpack(
  config: Config | null | undefined
): BuildpackRuntime | undefined {
  if (!config) return undefined;
  return BUILDPACKS.find(bp => bp.runtime === config.buildpack);
}

export function hasProjectMarkers(
  buildpack: BuildpackRuntime,
  workPath: string
): boolean {
  return buildpack.projectMarkers.some(name =>
    existsSync(join(workPath, name))
  );
}
