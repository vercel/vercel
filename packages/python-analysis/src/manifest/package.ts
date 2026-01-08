import path from 'node:path';

import { match as minimatchMatch } from 'minimatch';

import { readConfigIfExists } from '../util/config';
import { PythonAnalysisError } from '../util/error';
import type { AbsPath, RelPath } from '../util/fs';
import { isSubpath, normalizePath, readFileTextIfExists } from '../util/fs';
import { parsePep440Constraint } from './pep440';
import type { PipfileLike, PipfileLockLike } from './pipfile';
import {
  convertPipfileLockToPyprojectToml,
  convertPipfileToPyprojectToml,
} from './pipfile';
import { convertRequirementsToPyprojectToml } from './requirements-txt';
import type { PyProjectToml } from './types/pyproject';
import type {
  PythonConstraint,
  PythonRequest,
} from './types/python-specifiers';
import type { UvConfig } from './types/uv-config';
import {
  parsePythonVersionFile,
  pythonRequestFromConstraint,
} from './uv-python-version';

/**
 * Kinds of Python configuration files that can be discovered.
 *
 * These are standalone configuration files (not package manifests)
 * that affect Python version selection or runtime behavior.
 */
export enum PythonConfigKind {
  /** `.python-version` file specifying the Python version to use. */
  PythonVersion = '.python-version',
}

/**
 * Kinds of native Python package manifests.
 *
 * These are standard Python packaging formats that don't require conversion.
 */
export enum PythonManifestKind {
  /** Standard `pyproject.toml` file (PEP 517/518/621). */
  PyProjectToml = 'pyproject.toml',
}

/**
 * Kinds of Python package manifests that are converted to pyproject.toml format.
 *
 * These legacy or alternative formats are parsed and converted to a normalized
 * pyproject.toml representation for consistent handling.
 */
export enum PythonManifestConvertedKind {
  /** Pipenv's `Pipfile` manifest. */
  Pipfile = 'Pipfile',
  /** Pipenv's `Pipfile.lock` lockfile. */
  PipfileLock = 'Pipfile.lock',
  /** pip-tools' `requirements.in` input file. */
  RequirementsIn = 'requirements.in',
  /** Standard pip `requirements.txt` file. */
  RequirementsTxt = 'requirements.txt',
}

/**
 * Tracks the original source of a converted manifest.
 *
 * When a manifest is converted from a non-pyproject.toml format,
 * this records the original file type and path for reference.
 */
export interface PythonManifestOrigin {
  /** The kind of the original manifest file. */
  kind: PythonManifestKind | PythonManifestConvertedKind;
  /** Relative path to the original manifest file. */
  path: RelPath;
}

/**
 * A Python package manifest in normalized pyproject.toml format.
 *
 * This may represent either a native pyproject.toml file or a converted
 * manifest from another format (Pipfile, requirements.txt, etc.).
 */
export interface PythonManifest {
  /** Relative path to the manifest file. */
  path: RelPath;
  /** Parsed manifest data in pyproject.toml structure. */
  data: PyProjectToml;
  /** Origin information if this was converted from another format. */
  origin?: PythonManifestOrigin;
  /** Whether this manifest represents a workspace root. */
  isRoot?: boolean;
}

/**
 * Configuration from a `.python-version` file.
 *
 * Contains parsed Python version requests that can be used to
 * determine which Python version to use for the project.
 */
export interface PythonVersionConfig {
  kind: PythonConfigKind.PythonVersion;
  /** Relative path to the .python-version file. */
  path: RelPath;
  /** Parsed Python version requests from the file. */
  data: PythonRequest[];
}

/**
 * Union type for all Python configuration file types.
 *
 * Currently only includes `.python-version`, but can be extended
 * to support additional configuration file types.
 */
export type PythonConfig = PythonVersionConfig;

/**
 * Helper type to create a discriminated record from a union type.
 * Maps each discriminator value to its corresponding union member.
 *
 * This creates a lookup table where the keys are the possible values of
 * property `P` in the union `PythonConfig`, and the values are the specific
 * union members that have that property value.
 *
 * @example
 * // Given:
 * type Config = { kind: 'a'; dataA: string } | { kind: 'b'; dataB: number };
 *
 * // PythonConfigDiscriminatedRecord<Config, 'kind'> produces:
 * // {
 * //   'a': { kind: 'a'; dataA: string };
 * //   'b': { kind: 'b'; dataB: number };
 * // }
 *
 * @typeParam PythonConfig - A union type with a discriminant property
 * @typeParam P - The key of the discriminant property (e.g., 'kind')
 */
type PythonConfigDiscriminatedRecord<
  PythonConfig extends Record<P, PropertyKey>,
  P extends keyof PythonConfig,
> = {
  [K in PythonConfig[P]]: Extract<PythonConfig, Record<P, K>>;
};

/**
 * A partial record of Python configuration files keyed by their kind.
 *
 * Used to store discovered configuration files at each directory level
 * during package discovery.
 */
export type PythonConfigs = Partial<
  PythonConfigDiscriminatedRecord<PythonConfig, 'kind'>
>;

/**
 * Complete information about a discovered Python package.
 *
 * Contains the package manifest, associated configuration files,
 * Python version requirements, and workspace information.
 */
export interface PythonPackage {
  /** The package's manifest (pyproject.toml or converted equivalent). */
  manifest?: PythonManifest;
  /** Configuration files discovered between the package and workspace root. */
  configs?: PythonConfigs[];
  /** Python version constraints from various sources. */
  requiresPython?: PythonConstraint[];
  /** The workspace root manifest, if this package is part of a workspace. */
  workspaceManifest?: PythonManifest;
}

/**
 * Discover Python package information starting from an entrypoint directory.
 *
 * Walks up the directory tree from `entrypointDir` to `rootDir`, collecting:
 * - Python manifests (pyproject.toml, Pipfile, requirements.txt, etc.)
 * - Python configuration files (.python-version)
 * - Workspace relationships between packages
 *
 * The discovery process:
 * 1. Starts at the entrypoint directory and walks up to the root
 * 2. At each level, looks for manifests and configuration files
 * 3. Stops when it finds a workspace root or reaches the repository root
 * 4. Computes Python version requirements from all discovered sources
 *
 * @param entrypointDir - Directory containing the Python entrypoint file
 * @param rootDir - Repository root directory (discovery boundary)
 * @returns Discovered package information including manifest, configs, and constraints
 *
 * @throws {Error} If entrypointDir is outside of rootDir
 *
 * @example
 * const pkg = await discoverPythonPackage({
 *   entrypointDir: '/repo/packages/myapp',
 *   rootDir: '/repo',
 * });
 * // pkg.manifest contains the package's pyproject.toml data
 * // pkg.requiresPython contains Python version constraints
 */
export async function discoverPythonPackage({
  entrypointDir,
  rootDir,
}: {
  entrypointDir: string;
  rootDir: string;
}): Promise<PythonPackage> {
  const entrypointPath = normalizePath(entrypointDir);
  const rootPath = normalizePath(rootDir);
  let prefix = path.relative(rootPath, entrypointPath);
  if (prefix.startsWith('..')) {
    throw new PythonAnalysisError({
      message: 'Entrypoint directory outside of repository root',
      code: 'PYTHON_INVALID_ENTRYPOINT_PATH',
    });
  }
  const manifests: PythonManifest[] = [];
  let configs: PythonConfigs[] = [];

  for (;;) {
    const prefixConfigs = await loadPythonConfigs(rootPath, prefix);
    if (Object.keys(prefixConfigs).length !== 0) {
      configs.push(prefixConfigs);
    }

    const prefixManifest = await loadPythonManifest(rootPath, prefix);
    if (prefixManifest !== null) {
      manifests.push(prefixManifest);
      if (prefixManifest.isRoot) {
        break;
      }
    }
    if (prefix === '' || prefix === '.') {
      break;
    }
    prefix = path.dirname(prefix);
  }

  let entrypointManifest: PythonManifest | undefined;
  let workspaceManifest: PythonManifest | undefined;

  if (manifests.length === 0) {
    // No Python manifests detected in the repo
    return {
      configs,
    };
  } else {
    entrypointManifest = manifests[0];
    const entrypointWorkspaceManifest = findWorkspaceManifestFor(
      entrypointManifest,
      manifests
    );
    workspaceManifest = entrypointWorkspaceManifest;
    configs = configs.filter(config =>
      Object.values(config).some(
        cfg =>
          cfg !== undefined &&
          isSubpath(
            path.dirname(cfg.path),
            path.dirname(entrypointWorkspaceManifest.path)
          )
      )
    );
  }

  const requiresPython = computeRequiresPython(
    entrypointManifest,
    workspaceManifest,
    configs
  );

  return {
    manifest: entrypointManifest,
    workspaceManifest,
    configs,
    requiresPython,
  };
}

/**
 * Compute the `requires-python` constraints for a package.
 */
function computeRequiresPython(
  manifest: PythonManifest | undefined,
  workspaceManifest: PythonManifest | undefined,
  configs: PythonConfigs[]
): PythonConstraint[] {
  const constraints: PythonConstraint[] = [];

  // Check for `.python-version` between manifest and workspace
  for (const configSet of configs) {
    const pythonVersionConfig = configSet[PythonConfigKind.PythonVersion];
    if (pythonVersionConfig !== undefined) {
      constraints.push({
        request: pythonVersionConfig.data,
        source: `${pythonVersionConfig.path}`,
      });
      break;
    }
  }

  // Check `requires-python` from nearest package pyproject.toml
  const manifestRequiresPython = manifest?.data.project?.['requires-python'];
  if (manifestRequiresPython) {
    const parsed = parsePep440Constraint(manifestRequiresPython);
    if (parsed !== null && parsed.length > 0) {
      const request = pythonRequestFromConstraint(parsed);
      constraints.push({
        request: [request],
        source: `"requires-python" key in ${manifest.path}`,
      });
    }
  } else {
    // Check `requires-python` from workspace pyproject.toml
    const workspaceRequiresPython =
      workspaceManifest?.data.project?.['requires-python'];
    if (workspaceRequiresPython) {
      const parsed = parsePep440Constraint(workspaceRequiresPython);
      if (parsed !== null && parsed.length > 0) {
        const request = pythonRequestFromConstraint(parsed);
        constraints.push({
          request: [request],
          source: `"requires-python" key in ${workspaceManifest.path}`,
        });
      }
    }
  }

  return constraints;
}

function findWorkspaceManifestFor(
  manifest: PythonManifest,
  manifestStack: PythonManifest[]
): PythonManifest {
  if (manifest.isRoot) {
    return manifest;
  }

  for (const parentManifest of manifestStack) {
    if (parentManifest.path === manifest.path) {
      continue;
    }

    const workspace = parentManifest.data.tool?.uv?.workspace;
    if (workspace !== undefined) {
      let members = workspace.members ?? [];
      if (!Array.isArray(members)) {
        members = [];
      }
      let exclude = workspace.exclude ?? [];
      if (!Array.isArray(exclude)) {
        exclude = [];
      }

      const entrypointRelPath = path.relative(
        path.dirname(parentManifest.path),
        path.dirname(manifest.path)
      );
      if (
        members.length > 0 &&
        members.some(
          pat => minimatchMatch([entrypointRelPath], pat).length > 0
        ) &&
        !exclude.some(
          pat => minimatchMatch([entrypointRelPath], pat).length > 0
        )
      ) {
        return parentManifest;
      }
    }
  }

  return manifest;
}

async function loadPythonManifest(
  root: AbsPath,
  prefix: RelPath
): Promise<PythonManifest | null> {
  let manifest: PythonManifest | null = null;
  const pyproject = await maybeLoadPyProjectToml(root, prefix);
  if (pyproject !== null) {
    manifest = pyproject;
    manifest.isRoot = pyproject.data.tool?.uv?.workspace !== undefined;
  } else {
    // Prefer Pipfile.lock over Pipfile if both exist, because the lockfile
    // contains exact pinned versions and is more reliable for reproducibility.
    const pipfileLockPyProject = await maybeLoadPipfileLock(root, prefix);
    if (pipfileLockPyProject !== null) {
      manifest = pipfileLockPyProject;
      manifest.isRoot = true;
    } else {
      const pipfilePyProject = await maybeLoadPipfile(root, prefix);
      if (pipfilePyProject !== null) {
        manifest = pipfilePyProject;
        manifest.isRoot = true;
      } else {
        // Try various requirements*.{txt|in}
        for (const fileName of [
          'requirements.frozen.txt',
          'requirements-frozen.txt',
          'requirements.txt',
          'requirements.in',
          path.join('requirements', 'prod.txt'),
        ]) {
          const requirementsTxtManifest = await maybeLoadRequirementsTxt(
            root,
            prefix,
            fileName
          );
          if (requirementsTxtManifest !== null) {
            manifest = requirementsTxtManifest;
            manifest.isRoot = true;
            break;
          }
        }
      }
    }
  }

  return manifest;
}

async function maybeLoadPyProjectToml(
  root: AbsPath,
  subdir: RelPath
): Promise<PythonManifest | null> {
  const pyprojectTomlRelPath = path.join(subdir, 'pyproject.toml');
  const pyprojectTomlPath = path.join(root, pyprojectTomlRelPath);
  let pyproject: PyProjectToml | null;
  try {
    pyproject = await readConfigIfExists(pyprojectTomlPath);
  } catch (error: unknown) {
    if (error instanceof PythonAnalysisError) {
      error.path = pyprojectTomlRelPath;
      throw error;
    }
    throw new PythonAnalysisError({
      message: `could not parse pyproject.toml: ${error instanceof Error ? error.message : String(error)}`,
      code: 'PYTHON_PYPROJECT_PARSE_ERROR',
      path: pyprojectTomlRelPath,
    });
  }

  if (pyproject === null) {
    return null;
  }

  // Inject contents of uv.toml into pyproject.toml, overriding
  // [tool.uv].
  const uvTomlRelPath = path.join(subdir, 'uv.toml');
  const uvTomlPath = path.join(root, uvTomlRelPath);
  let uvToml: UvConfig | null;
  try {
    uvToml = await readConfigIfExists(uvTomlPath);
  } catch (error: unknown) {
    if (error instanceof PythonAnalysisError) {
      error.path = uvTomlRelPath;
      throw error;
    }
    throw new PythonAnalysisError({
      message: `could not parse uv.toml: ${error instanceof Error ? error.message : String(error)}`,
      code: 'PYTHON_UV_CONFIG_PARSE_ERROR',
      path: uvTomlRelPath,
    });
  }

  if (uvToml !== null) {
    if (pyproject.tool === undefined || pyproject.tool === null) {
      pyproject.tool = { uv: uvToml };
    } else {
      pyproject.tool.uv = uvToml;
    }
  }

  return {
    path: pyprojectTomlRelPath,
    data: pyproject,
  };
}

async function maybeLoadPipfile(
  root: AbsPath,
  subdir: RelPath
): Promise<PythonManifest | null> {
  const pipfileRelPath = path.join(subdir, 'Pipfile');
  const pipfilePath = path.join(root, pipfileRelPath);
  let pipfile: PipfileLike | null;
  try {
    pipfile = await readConfigIfExists(pipfilePath, '.toml');
  } catch (error: unknown) {
    if (error instanceof PythonAnalysisError) {
      error.path = pipfileRelPath;
      throw error;
    }
    throw new PythonAnalysisError({
      message: `could not parse Pipfile: ${error instanceof Error ? error.message : String(error)}`,
      code: 'PYTHON_PIPFILE_PARSE_ERROR',
      path: pipfileRelPath,
    });
  }

  if (pipfile === null) {
    return null;
  }

  const pyproject = convertPipfileToPyprojectToml(pipfile);

  return {
    path: pipfileRelPath,
    data: pyproject,
    origin: {
      kind: PythonManifestConvertedKind.Pipfile,
      path: pipfileRelPath,
    },
  };
}

async function maybeLoadPipfileLock(
  root: AbsPath,
  subdir: RelPath
): Promise<PythonManifest | null> {
  const pipfileLockRelPath = path.join(subdir, 'Pipfile.lock');
  const pipfileLockPath = path.join(root, pipfileLockRelPath);
  let pipfileLock: PipfileLockLike | null;
  try {
    pipfileLock = await readConfigIfExists(pipfileLockPath, '.json');
  } catch (error: unknown) {
    if (error instanceof PythonAnalysisError) {
      error.path = pipfileLockRelPath;
      throw error;
    }
    throw new PythonAnalysisError({
      message: `could not parse Pipfile.lock: ${error instanceof Error ? error.message : String(error)}`,
      code: 'PYTHON_PIPFILE_LOCK_PARSE_ERROR',
      path: pipfileLockRelPath,
    });
  }

  if (pipfileLock === null) {
    return null;
  }

  const pyproject = convertPipfileLockToPyprojectToml(pipfileLock);

  return {
    path: pipfileLockRelPath,
    data: pyproject,
    origin: {
      kind: PythonManifestConvertedKind.PipfileLock,
      path: pipfileLockRelPath,
    },
  };
}

async function maybeLoadRequirementsTxt(
  root: AbsPath,
  subdir: RelPath,
  fileName: string
): Promise<PythonManifest | null> {
  const requirementsTxtRelPath = path.join(subdir, fileName);
  const requirementsTxtPath = path.join(root, requirementsTxtRelPath);
  const requirementsContent: string | null =
    await readFileTextIfExists(requirementsTxtPath);

  if (requirementsContent === null) {
    return null;
  }

  try {
    const pyproject = convertRequirementsToPyprojectToml(requirementsContent);

    return {
      path: requirementsTxtRelPath,
      data: pyproject,
      origin: {
        kind: PythonManifestConvertedKind.RequirementsTxt,
        path: requirementsTxtRelPath,
      },
    };
  } catch (error: unknown) {
    if (error instanceof PythonAnalysisError) {
      error.path = requirementsTxtRelPath;
      throw error;
    }
    throw new PythonAnalysisError({
      message: `could not parse ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      code: 'PYTHON_REQUIREMENTS_PARSE_ERROR',
      path: requirementsTxtRelPath,
    });
  }
}

async function loadPythonConfigs(
  root: AbsPath,
  prefix: RelPath
): Promise<PythonConfigs> {
  const configs: PythonConfigs = {};
  const pythonRequest = await maybeLoadPythonRequest(root, prefix);
  if (pythonRequest !== null) {
    configs[PythonConfigKind.PythonVersion] = pythonRequest;
  }

  return configs;
}

/*
 * Read and parse a .python-version file if it exists in the given subdirectory.
 */
async function maybeLoadPythonRequest(
  root: AbsPath,
  subdir: RelPath
): Promise<PythonVersionConfig | null> {
  const dotPythonVersionRelPath: RelPath = path.join(subdir, '.python-version');
  const dotPythonVersionPath: AbsPath = path.join(
    root,
    dotPythonVersionRelPath
  );
  const data: string | null = await readFileTextIfExists(dotPythonVersionPath);

  if (data === null) {
    return null;
  }

  const pyreq = parsePythonVersionFile(data);
  if (pyreq === null) {
    throw new PythonAnalysisError({
      message: `could not parse .python-version file: no valid Python version requests found`,
      code: 'PYTHON_VERSION_FILE_PARSE_ERROR',
      path: dotPythonVersionRelPath,
    });
  }

  return {
    kind: PythonConfigKind.PythonVersion,
    path: dotPythonVersionRelPath,
    data: pyreq,
  };
}
