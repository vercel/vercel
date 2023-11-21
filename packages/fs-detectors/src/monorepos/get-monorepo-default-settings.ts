import { join } from 'node:path';
import { monorepoManagers } from './monorepo-managers.js';
import { packageManagers } from '../package-managers/package-managers.js';
import { DetectorFilesystem } from '../detectors/filesystem.js';
import { detectFramework } from '../detect-framework.js';
import JSON5 from 'json5';
import semver from 'semver';

export class MissingBuildPipeline extends Error {
  constructor() {
    super(
      'Missing required `build` pipeline in turbo.json or package.json Turbo configuration.'
    );
  }
}

export class MissingBuildTarget extends Error {
  constructor() {
    super(
      'Missing required `build` target in either nx.json, project.json, or package.json Nx configuration.'
    );
  }
}

function supportsRootCommand(turboSemVer: string | undefined) {
  if (!turboSemVer) {
    return false;
  }

  if (!semver.validRange(turboSemVer)) {
    return false;
  }

  return !semver.intersects(turboSemVer, '<1.8.0');
}

type MonorepoDefaultSettings = {
  buildCommand?: string | null;
  installCommand?: string | null;
  commandForIgnoringBuildStep?: string;
  monorepoManager: string;
} | null;

export async function getMonorepoDefaultSettings(
  projectName: string,
  projectPath: string,
  relativeToRoot: string,
  detectorFilesystem: DetectorFilesystem
): Promise<MonorepoDefaultSettings> {
  const [monorepoManager, packageManager] = await Promise.all([
    detectFramework({
      fs: detectorFilesystem,
      frameworkList: monorepoManagers,
    }),
    detectFramework({
      fs: detectorFilesystem,
      frameworkList: packageManagers,
    }),
  ]);

  if (monorepoManager === 'turbo') {
    const [turboJSONBuf, packageJSONBuf] = await Promise.all([
      detectorFilesystem.readFile('turbo.json').catch(() => null),
      detectorFilesystem.readFile('package.json').catch(() => null),
    ]);

    let hasBuildPipeline = false;
    let turboSemVer = null;

    if (turboJSONBuf !== null) {
      const turboJSON = JSON5.parse(turboJSONBuf.toString('utf-8'));

      if (turboJSON?.pipeline?.build) {
        hasBuildPipeline = true;
      }
    }

    if (packageJSONBuf !== null) {
      const packageJSON = JSON.parse(packageJSONBuf.toString('utf-8'));

      if (packageJSON?.turbo?.pipeline?.build) {
        hasBuildPipeline = true;
      }

      turboSemVer =
        packageJSON?.dependencies?.turbo ||
        packageJSON?.devDependencies?.turbo ||
        null;
    }

    if (!hasBuildPipeline) {
      throw new MissingBuildPipeline();
    }

    if (projectPath === '/') {
      return {
        monorepoManager: 'turbo',
        buildCommand: 'turbo run build',
        installCommand: packageManager ? `${packageManager} install` : null,
        commandForIgnoringBuildStep: 'npx turbo-ignore',
      };
    }

    let buildCommand = null;
    if (projectPath) {
      if (supportsRootCommand(turboSemVer)) {
        buildCommand = `turbo run build`;
      } else {
        // We don't know for sure if the local `turbo` supports inference.
        buildCommand = `cd ${relativeToRoot} && turbo run build --filter={${projectPath}}...`;
      }
    }

    return {
      monorepoManager: 'turbo',
      buildCommand,
      installCommand:
        packageManager === 'npm'
          ? `${packageManager} install --prefix=${relativeToRoot}`
          : packageManager
          ? `${packageManager} install`
          : null,
      commandForIgnoringBuildStep: 'npx turbo-ignore',
    };
  } else if (monorepoManager === 'nx') {
    // No ENOENT handling required here since conditional wouldn't be `true` unless `nx.json` was found.
    const nxJSONBuf = await detectorFilesystem.readFile('nx.json');
    const nxJSON = JSON5.parse(nxJSONBuf.toString('utf-8'));

    if (!nxJSON?.targetDefaults?.build) {
      const [projectJSONBuf, packageJSONBuf] = await Promise.all([
        detectorFilesystem
          .readFile(join(projectPath, 'project.json'))
          .catch(() => null),
        detectorFilesystem
          .readFile(join(projectPath, 'package.json'))
          .catch(() => null),
      ]);

      let hasBuildTarget = false;

      if (projectJSONBuf) {
        const projectJSON = JSON5.parse(projectJSONBuf.toString('utf-8'));
        if (projectJSON?.targets?.build) {
          hasBuildTarget = true;
        }
      }

      if (packageJSONBuf) {
        const packageJSON = JSON5.parse(packageJSONBuf.toString('utf-8'));
        if (packageJSON?.nx) {
          if (packageJSON.nx.targets?.build) {
            hasBuildTarget = true;
          }
        }
      }

      if (!hasBuildTarget) {
        throw new MissingBuildTarget();
      }
    }

    if (projectPath === '/') {
      return {
        monorepoManager: 'nx',
        buildCommand: 'npx nx build',
        installCommand: packageManager ? `${packageManager} install` : null,
      };
    }
    return {
      monorepoManager: 'nx',
      buildCommand: projectName
        ? `cd ${relativeToRoot} && npx nx build ${projectName}`
        : null,
      installCommand:
        packageManager === 'npm'
          ? `${packageManager} install --prefix=${relativeToRoot}`
          : packageManager
          ? `${packageManager} install`
          : null,
    };
  }
  // TODO (@Ethan-Arrowood) - Revisit rush support when we can test it better
  /* else if (monorepoManager === 'rush') {
    setCommand(
      'buildCommand',
      `node ${relativeToRoot}/common/scripts/install-run-rush.js build --to ${projectName}`
    );
    setCommand(
      'installCommand',
      `node ${relativeToRoot}/common/scripts/install-run-rush.js install`
    );
  } */

  return null;
}
