import type { UvConfig } from './uv-config';

/**
 * [build-system] per PEP 518.
 */
export interface PyProjectBuildSystem {
  requires: string[];
  'build-backend'?: string;
  'backend-path'?: string[];
  [key: string]: unknown;
}

/**
 * Core PEP 621 fields for [project].
 */
export interface PyProjectProject {
  name?: string;
  version?: string;
  description?: string;
  readme?:
    | string
    | {
        file: string | string[];
        content_type?: string;
      };
  keywords?: string[];
  authors?: Array<{
    name?: string;
    email?: string;
  }>;
  maintainers?: Array<{
    name?: string;
    email?: string;
  }>;
  license?:
    | string
    | {
        text?: string;
        file?: string;
      };
  classifiers?: string[];
  urls?: Record<string, string>;
  dependencies?: string[];
  'optional-dependencies'?: Record<string, string[]>;
  dynamic?: string[];
  'requires-python'?: string;
  scripts?: Record<string, string>;
  entry_points?: Record<string, Record<string, string>>;
  [key: string]: unknown;
}

/**
 * [dependency-groups]
 * dev = ["pytest>=7", ...]
 * docs = ["sphinx", ...]
 */
export type PyProjectDependencyGroups = Record<string, string[]>;

/**
 * [tool.FOO]
 */
export interface PyProjectToolSection {
  uv?: UvConfig;
  [toolName: string]: unknown;
}

/**
 * A high-level representation of a pyproject.toml file.
 */
export interface PyProjectToml {
  project?: PyProjectProject;
  'build-system'?: PyProjectBuildSystem;
  'dependency-groups'?: PyProjectDependencyGroups;
  tool?: PyProjectToolSection;

  // Any additional top-level keys (for future PEPs or custom tooling)
  [key: string]: unknown;
}
