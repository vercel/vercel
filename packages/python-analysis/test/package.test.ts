import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  discoverPythonPackage,
  PythonAnalysisError,
  PythonConfigKind,
  PythonLockFileKind,
  PythonManifestConvertedKind,
} from '../src';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function fixtureRoot(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

describe('discoverPythonPackage', () => {
  describe('basic manifest discovery', () => {
    it('discovers simple requirements.txt', async () => {
      const root = fixtureRoot('simple-requirements');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe('requirements.txt');
      expect(result.manifest?.origin?.kind).toBe(
        PythonManifestConvertedKind.RequirementsTxt
      );
      expect(result.manifest?.data.project?.dependencies).toContainEqual(
        expect.stringMatching(/flask/i)
      );
    });

    it('discovers simple pyproject.toml', async () => {
      const root = fixtureRoot('simple-pyproject');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe('pyproject.toml');
      expect(result.manifest?.origin).toBeUndefined();
      expect(result.manifest?.data.project?.name).toBe('simple-app');
      expect(result.manifest?.data.project?.['requires-python']).toBe('>=3.10');
      expect(result.manifest?.data.project?.dependencies).toContain(
        'fastapi>=0.100.0'
      );
    });

    it('discovers Pipfile', async () => {
      const root = fixtureRoot('pipfile-basic');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe('Pipfile');
      expect(result.manifest?.origin?.kind).toBe(
        PythonManifestConvertedKind.Pipfile
      );
      expect(result.manifest?.data.project?.dependencies).toContainEqual(
        expect.stringMatching(/flask/i)
      );
    });

    it('discovers Pipfile.lock when Pipfile is absent', async () => {
      const root = fixtureRoot('pipfile-lock-only');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe('Pipfile.lock');
      expect(result.manifest?.origin?.kind).toBe(
        PythonManifestConvertedKind.PipfileLock
      );
      expect(result.manifest?.data.project?.dependencies).toContainEqual(
        expect.stringMatching(/flask/i)
      );
    });

    it('discovers requirements.frozen.txt', async () => {
      const root = fixtureRoot('requirements-frozen');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe('requirements.frozen.txt');
      expect(result.manifest?.origin?.kind).toBe(
        PythonManifestConvertedKind.RequirementsTxt
      );
    });

    it('discovers requirements.in', async () => {
      const root = fixtureRoot('requirements-in');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe('requirements.in');
      expect(result.manifest?.origin?.kind).toBe(
        PythonManifestConvertedKind.RequirementsTxt
      );
    });
  });

  describe('manifest priority', () => {
    it('prefers pyproject.toml over Pipfile and requirements.txt', async () => {
      const root = fixtureRoot('manifest-priority');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe('pyproject.toml');
      // Should use pyproject.toml data, not Pipfile or requirements.txt
      expect(result.manifest?.data.project?.name).toBe('priority-app');
      expect(result.manifest?.data.project?.['requires-python']).toBe('>=3.11');
    });
  });

  describe('nested entrypoint discovery', () => {
    it('discovers manifest at root when entrypoint is in subdirectory', async () => {
      const root = fixtureRoot('nested-entrypoint');
      const entrypoint = path.join(root, 'api');
      const result = await discoverPythonPackage({
        entrypointDir: entrypoint,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe('pyproject.toml');
      expect(result.manifest?.data.project?.name).toBe('nested-app');
    });

    it('discovers local manifest in entrypoint directory', async () => {
      const root = fixtureRoot('entrypoint-local-manifest');
      const entrypoint = path.join(root, 'api', 'app');
      const result = await discoverPythonPackage({
        entrypointDir: entrypoint,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe(path.join('api', 'app', 'Pipfile'));
      expect(result.manifest?.origin?.kind).toBe(
        PythonManifestConvertedKind.Pipfile
      );
    });

    it('discovers manifest from deeply nested entrypoint', async () => {
      const root = fixtureRoot('deep-nested');
      const entrypoint = path.join(root, 'a', 'b', 'c');
      const result = await discoverPythonPackage({
        entrypointDir: entrypoint,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe('pyproject.toml');
      expect(result.manifest?.data.project?.name).toBe('deep-nested-root');
    });
  });

  describe('workspace discovery', () => {
    it('discovers workspace root and member', async () => {
      const root = fixtureRoot('uv-workspace');
      const memberDir = path.join(root, 'packages', 'app');
      const result = await discoverPythonPackage({
        entrypointDir: memberDir,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe(
        path.join('packages', 'app', 'pyproject.toml')
      );
      expect(result.manifest?.data.project?.name).toBe('myapp');

      expect(result.workspaceManifest).toBeDefined();
      expect(result.workspaceManifest?.path).toBe('pyproject.toml');
      expect(result.workspaceManifest?.data.project?.name).toBe(
        'workspace-root'
      );
      expect(result.workspaceManifest?.isRoot).toBe(true);
    });

    it('workspace root is same as manifest when at root', async () => {
      const root = fixtureRoot('uv-workspace');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.workspaceManifest).toBeDefined();
      expect(result.manifest?.path).toBe(result.workspaceManifest?.path);
      expect(result.manifest?.isRoot).toBe(true);
    });

    it('respects workspace exclude patterns', async () => {
      const root = fixtureRoot('workspace-exclude');

      // Included package should have workspace root
      const includedDir = path.join(root, 'packages', 'included');
      const includedResult = await discoverPythonPackage({
        entrypointDir: includedDir,
        rootDir: root,
      });

      expect(includedResult.manifest?.path).toBe(
        path.join('packages', 'included', 'pyproject.toml')
      );
      expect(includedResult.workspaceManifest?.path).toBe('pyproject.toml');

      // Excluded package should NOT have workspace root (it becomes its own root)
      const excludedDir = path.join(root, 'packages', 'excluded');
      const excludedResult = await discoverPythonPackage({
        entrypointDir: excludedDir,
        rootDir: root,
      });

      expect(excludedResult.manifest?.path).toBe(
        path.join('packages', 'excluded', 'pyproject.toml')
      );
      // The excluded package is not part of the workspace, so workspace manifest
      // should be same as manifest (it's its own root)
      expect(excludedResult.workspaceManifest?.path).toBe(
        excludedResult.manifest?.path
      );
    });
  });

  describe('uv.toml integration', () => {
    it('loads uv.toml and injects into pyproject.toml tool.uv', async () => {
      const root = fixtureRoot('uv-toml');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe('pyproject.toml');
      // uv.toml should be injected into tool.uv
      expect(result.manifest?.data.tool?.uv).toBeDefined();
      expect(result.manifest?.data.tool?.uv?.workspace?.members).toContain(
        'packages/*'
      );
      expect(result.manifest?.isRoot).toBe(true);
    });
  });

  describe('.python-version config discovery', () => {
    it('discovers .python-version file', async () => {
      const root = fixtureRoot('python-version-file');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.configs).toBeDefined();
      expect(result.configs?.length).toBeGreaterThan(0);

      const pythonVersionConfig = result.configs?.find(
        cfg => cfg[PythonConfigKind.PythonVersion] !== undefined
      );
      expect(pythonVersionConfig).toBeDefined();
      expect(pythonVersionConfig?.[PythonConfigKind.PythonVersion]?.path).toBe(
        '.python-version'
      );
    });

    it('discovers nearest .python-version in nested directories', async () => {
      const root = fixtureRoot('python-version-nested');
      const entrypoint = path.join(root, 'api');
      const result = await discoverPythonPackage({
        entrypointDir: entrypoint,
        rootDir: root,
      });

      expect(result.configs).toBeDefined();
      // Should find the api/.python-version (nearest to entrypoint)
      const pythonVersionConfig = result.configs?.find(
        cfg => cfg[PythonConfigKind.PythonVersion] !== undefined
      );
      expect(pythonVersionConfig).toBeDefined();
      expect(pythonVersionConfig?.[PythonConfigKind.PythonVersion]?.path).toBe(
        path.join('api', '.python-version')
      );
    });

    it('uses .python-version from intermediate directory in deep nesting', async () => {
      const root = fixtureRoot('deep-nested');
      const entrypoint = path.join(root, 'a', 'b', 'c');
      const result = await discoverPythonPackage({
        entrypointDir: entrypoint,
        rootDir: root,
      });

      expect(result.configs).toBeDefined();
      const pythonVersionConfig = result.configs?.find(
        cfg => cfg[PythonConfigKind.PythonVersion] !== undefined
      );
      expect(pythonVersionConfig).toBeDefined();
      expect(pythonVersionConfig?.[PythonConfigKind.PythonVersion]?.path).toBe(
        path.join('a', 'b', '.python-version')
      );
    });
  });

  describe('requires-python computation', () => {
    it('extracts requires-python from pyproject.toml', async () => {
      const root = fixtureRoot('simple-pyproject');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.requiresPython).toBeDefined();
      expect(result.requiresPython?.length).toBeGreaterThan(0);
      const constraint = result.requiresPython?.find(c =>
        c.source.includes('requires-python')
      );
      expect(constraint).toBeDefined();
    });

    it('extracts requires-python from .python-version file', async () => {
      const root = fixtureRoot('python-version-file');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.requiresPython).toBeDefined();
      const constraint = result.requiresPython?.find(c =>
        c.source.includes('.python-version')
      );
      expect(constraint).toBeDefined();
    });

    it('uses workspace requires-python when package does not specify', async () => {
      const root = fixtureRoot('uv-workspace');
      const libDir = path.join(root, 'packages', 'lib');
      const result = await discoverPythonPackage({
        entrypointDir: libDir,
        rootDir: root,
      });

      // The lib package has requires-python
      expect(result.requiresPython).toBeDefined();
      expect(result.requiresPython?.length).toBeGreaterThan(0);
    });
  });

  describe('no manifest found', () => {
    it('returns empty result when no manifest files exist', async () => {
      const root = fixtureRoot('no-manifest');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeUndefined();
      expect(result.workspaceManifest).toBeUndefined();
      // configs may still be present if .python-version exists
    });
  });

  describe('error handling', () => {
    it('throws PythonAnalysisError for invalid pyproject.toml', async () => {
      const root = fixtureRoot('invalid-pyproject');

      await expect(
        discoverPythonPackage({
          entrypointDir: root,
          rootDir: root,
        })
      ).rejects.toThrow(PythonAnalysisError);

      try {
        await discoverPythonPackage({
          entrypointDir: root,
          rootDir: root,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(PythonAnalysisError);
        expect((error as PythonAnalysisError).code).toBe(
          'PYTHON_CONFIG_PARSE_ERROR'
        );
        expect((error as PythonAnalysisError).path).toBe('pyproject.toml');
      }
    });

    it('throws PythonAnalysisError for invalid Pipfile', async () => {
      const root = fixtureRoot('invalid-pipfile');

      await expect(
        discoverPythonPackage({
          entrypointDir: root,
          rootDir: root,
        })
      ).rejects.toThrow(PythonAnalysisError);

      try {
        await discoverPythonPackage({
          entrypointDir: root,
          rootDir: root,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(PythonAnalysisError);
        expect((error as PythonAnalysisError).code).toBe(
          'PYTHON_CONFIG_PARSE_ERROR'
        );
        expect((error as PythonAnalysisError).path).toBe('Pipfile');
      }
    });

    it('throws PythonAnalysisError for invalid .python-version', async () => {
      const root = fixtureRoot('invalid-python-version');

      await expect(
        discoverPythonPackage({
          entrypointDir: root,
          rootDir: root,
        })
      ).rejects.toThrow(PythonAnalysisError);

      try {
        await discoverPythonPackage({
          entrypointDir: root,
          rootDir: root,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(PythonAnalysisError);
        expect((error as PythonAnalysisError).code).toBe(
          'PYTHON_VERSION_FILE_PARSE_ERROR'
        );
      }
    });

    it('throws error when entrypoint is outside root', async () => {
      const root = fixtureRoot('simple-pyproject');
      const outsideDir = path.join(root, '..', '..', 'outside');

      await expect(
        discoverPythonPackage({
          entrypointDir: outsideDir,
          rootDir: root,
        })
      ).rejects.toThrow('Entrypoint directory outside of repository root');
    });
  });

  describe('edge cases', () => {
    it('handles root and entrypoint being the same directory', async () => {
      const root = fixtureRoot('simple-pyproject');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe('pyproject.toml');
    });

    it('handles paths with trailing slashes', async () => {
      const root = fixtureRoot('simple-pyproject') + '/';
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
    });

    it('handles absolute paths correctly', async () => {
      const root = path.resolve(fixtureRoot('nested-entrypoint'));
      const entrypoint = path.resolve(root, 'api');
      const result = await discoverPythonPackage({
        entrypointDir: entrypoint,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      // Path should be relative
      expect(result.manifest?.path).toBe('pyproject.toml');
    });
  });

  describe('lock file detection', () => {
    it('discovers uv.lock when present with pyproject.toml', async () => {
      const root = fixtureRoot('with-uv-lock');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe('pyproject.toml');
      expect(result.manifest?.lockFile).toBeDefined();
      expect(result.manifest?.lockFile?.kind).toBe(PythonLockFileKind.UvLock);
      expect(result.manifest?.lockFile?.path).toBe('uv.lock');
    });

    it('discovers pylock.toml when present with pyproject.toml', async () => {
      const root = fixtureRoot('with-pylock');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.path).toBe('pyproject.toml');
      expect(result.manifest?.lockFile).toBeDefined();
      expect(result.manifest?.lockFile?.kind).toBe(
        PythonLockFileKind.PylockToml
      );
      expect(result.manifest?.lockFile?.path).toBe('pylock.toml');
    });

    it('prefers uv.lock over pylock.toml when both exist', async () => {
      const root = fixtureRoot('with-both-locks');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.lockFile).toBeDefined();
      // uv.lock should take precedence over pylock.toml
      expect(result.manifest?.lockFile?.kind).toBe(PythonLockFileKind.UvLock);
      expect(result.manifest?.lockFile?.path).toBe('uv.lock');
    });

    it('returns no lock file when none exists', async () => {
      const root = fixtureRoot('simple-pyproject');
      const result = await discoverPythonPackage({
        entrypointDir: root,
        rootDir: root,
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest?.lockFile).toBeUndefined();
    });
  });
});
