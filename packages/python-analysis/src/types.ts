/**
 * Types-only entrypoint for @vercel/python-analysis.
 *
 * Import from this module to avoid pulling in Zod and other runtime dependencies.
 *
 * @example
 * import type { PyProjectToml, UvConfig } from '@vercel/python-analysis/types';
 *
 * @module types
 */

// PyProject types
export type {
  License,
  LicenseObject,
  Person,
  PyProjectBuildSystem,
  PyProjectDependencyGroups,
  PyProjectProject,
  PyProjectToml,
  PyProjectToolSection,
  Readme,
  ReadmeObject,
} from './manifest/pyproject/types';

// UV config types
export type {
  UvConfig,
  UvConfigWorkspace,
  UvIndexEntry,
} from './manifest/uv-config/types';

// Pipfile types
export type {
  PipfileDependency,
  PipfileDependencyDetail,
  PipfileLike,
  PipfileLockLike,
  PipfileLockMeta,
  PipfileSource,
} from './manifest/pipfile/types';

// Requirement types
export type {
  DependencySource,
  HashDigest,
  NormalizedRequirement,
} from './manifest/requirement/types';

// Python specifier types
export type {
  PythonBuild,
  PythonConstraint,
  PythonImplementation,
  PythonPlatformRequest,
  PythonRequest,
  PythonVariant,
  PythonVersion,
  PythonVersionRequest,
  UnknownPythonImplementation,
} from './manifest/python-specifiers';

// Package discovery types
export type {
  PythonConfig,
  PythonConfigs,
  PythonManifest,
  PythonManifestOrigin,
  PythonPackage,
  PythonVersionConfig,
} from './manifest/package';

// Python selection types
export type { PythonSelectionResult } from './manifest/python-selector';
