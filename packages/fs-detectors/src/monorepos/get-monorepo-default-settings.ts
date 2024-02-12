import { join } from 'path';
import { monorepoManagers } from './monorepo-managers';
import { packageManagers } from '../package-managers/package-managers';
import { DetectorFilesystem } from '../detectors/filesystem';
import { detectFramework } from '../detect-framework';
import JSON5 from 'json5';

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

export async function getMonorepoDefaultSettings(
  projectName: string,
  projectPath: string,
  relativeToRoot: string,
  detectorFilesystem: DetectorFilesystem
) {
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

  let installCommand = `${packageManager} install`;
  switch (packageManager) {
    case 'npm':
      installCommand = `${packageManager} install --prefix=${relativeToRoot}`;
      break;
    case 'pnpm':
      installCommand = `${packageManager} --filter ${projectName}... install`;
      break;
    default:
      break;
  }

  if (monorepoManager === 'turbo') {
    const [turboJSONBuf, packageJSONBuf] = await Promise.all([
      detectorFilesystem.readFile('turbo.json').catch(() => null),
      detectorFilesystem.readFile('package.json').catch(() => null),
    ]);

    let hasBuildPipeline = false;

    if (turboJSONBuf !== null) {
      const turboJSON = JSON5.parse(turboJSONBuf.toString('utf-8'));

      if (turboJSON?.pipeline?.build) {
        hasBuildPipeline = true;
      }
    } else if (packageJSONBuf !== null) {
      const packageJSON = JSON.parse(packageJSONBuf.toString('utf-8'));

      if (packageJSON?.turbo?.pipeline?.build) {
        hasBuildPipeline = true;
      }
    }

    if (!hasBuildPipeline) {
      throw new MissingBuildPipeline();
    }

    return {
      monorepoManager: 'turbo',
      buildCommand: `cd ${relativeToRoot} && npx turbo run build --filter={${projectPath}}...`,
      installCommand,
      commandForIgnoringBuildStep: `cd ${relativeToRoot} && npx turbo-ignore`,
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

    return {
      monorepoManager: 'nx',
      buildCommand: `cd ${relativeToRoot} && npx nx build ${projectName}`,
      installCommand,
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
