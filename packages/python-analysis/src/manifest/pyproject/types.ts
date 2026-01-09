/**
 * Pure TypeScript interface definitions for pyproject.toml types.
 *
 * These interfaces serve as the source of truth for types.
 * Zod schemas are generated from these using ts-to-zod.
 *
 * @module pyproject/types
 */

import type { UvConfig } from '../uv-config/types';

/**
 * [build-system] per PEP 518.
 * @passthrough
 */
export interface PyProjectBuildSystem {
  requires: string[];
  'build-backend'?: string;
  'backend-path'?: string[];
}

/**
 * Author/maintainer entry.
 * @passthrough
 */
export interface Person {
  name?: string;
  email?: string;
}

/**
 * Readme field as an object.
 * @passthrough
 */
export interface ReadmeObject {
  file: string | string[];
  content_type?: string;
}

/**
 * Readme field (can be string or object).
 */
export type Readme = string | ReadmeObject;

/**
 * License field as an object.
 * @passthrough
 */
export interface LicenseObject {
  text?: string;
  file?: string;
}

/**
 * License field (can be string or object).
 */
export type License = string | LicenseObject;

/**
 * Core PEP 621 fields for [project].
 * @passthrough
 */
export interface PyProjectProject {
  name?: string;
  version?: string;
  description?: string;
  readme?: Readme;
  keywords?: string[];
  authors?: Person[];
  maintainers?: Person[];
  license?: License;
  classifiers?: string[];
  urls?: Record<string, string>;
  dependencies?: string[];
  'optional-dependencies'?: Record<string, string[]>;
  dynamic?: string[];
  'requires-python'?: string;
  scripts?: Record<string, string>;
  entry_points?: Record<string, Record<string, string>>;
}

/**
 * [dependency-groups].
 */
export type PyProjectDependencyGroups = Record<string, string[]>;

/**
 * [tool.FOO] section.
 * @passthrough
 */
export interface PyProjectToolSection {
  uv?: UvConfig;
}

/**
 * A pyproject.toml file.
 * @passthrough
 */
export interface PyProjectToml {
  project?: PyProjectProject;
  'build-system'?: PyProjectBuildSystem;
  'dependency-groups'?: PyProjectDependencyGroups;
  tool?: PyProjectToolSection;
}
