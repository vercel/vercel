/**
 * @vercel/python-analysis - Python package manifest discovery and analysis.
 *
 * This is the main entrypoint providing both runtime and type exports.
 * For types-only imports (to avoid bundling Zod), use '@vercel/python-analysis/types'.
 *
 * @module @vercel/python-analysis
 */

// =============================================================================
// Package discovery (runtime + types)
// =============================================================================

export type {
  PythonConfig,
  PythonConfigs,
  PythonManifest,
  PythonManifestOrigin,
  PythonPackage,
  PythonVersionConfig,
} from './manifest/package';

export {
  discoverPythonPackage,
  PythonConfigKind,
  PythonManifestConvertedKind,
  PythonManifestKind,
} from './manifest/package';

// =============================================================================
// Python selection (runtime + types)
// =============================================================================

export type { PythonSelectionResult } from './manifest/python-selector';
export { selectPython } from './manifest/python-selector';

// =============================================================================
// Errors
// =============================================================================

export { PythonAnalysisError } from './util/error';

// =============================================================================
// Schemas (runtime validation)
// =============================================================================

// PyProject schemas
export {
  LicenseObjectSchema,
  LicenseSchema,
  PersonSchema,
  PyProjectBuildSystemSchema,
  PyProjectDependencyGroupsSchema,
  PyProjectProjectSchema,
  PyProjectToolSectionSchema,
  PyProjectTomlSchema,
  ReadmeObjectSchema,
  ReadmeSchema,
} from './manifest/pyproject/schema';

// PyProject types (from source of truth)
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

// UV config schemas
export {
  UvConfigSchema,
  UvConfigWorkspaceSchema,
  UvIndexEntrySchema,
} from './manifest/uv-config/schema';

// UV config types (from source of truth)
export type {
  UvConfig,
  UvConfigWorkspace,
  UvIndexEntry,
} from './manifest/uv-config/types';

// Pipfile schemas
export {
  PipfileDependencyDetailSchema,
  PipfileDependencySchema,
  PipfileLikeSchema,
  PipfileLockLikeSchema,
  PipfileLockMetaSchema,
  PipfileSourceSchema,
} from './manifest/pipfile/schema';

// Pipfile types (from source of truth)
export type {
  PipfileDependency,
  PipfileDependencyDetail,
  PipfileLike,
  PipfileLockLike,
  PipfileLockMeta,
  PipfileSource,
} from './manifest/pipfile/types';

// Requirement schemas
export {
  DependencySourceSchema,
  HashDigestSchema,
  NormalizedRequirementSchema,
} from './manifest/requirement/schema';

// Requirement types (from source of truth)
export type {
  DependencySource,
  HashDigest,
  NormalizedRequirement,
} from './manifest/requirement/types';

// =============================================================================
// Python specifier types (no schemas - internal types)
// =============================================================================

export {
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
