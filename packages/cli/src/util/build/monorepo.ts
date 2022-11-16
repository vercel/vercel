import fs from 'fs-extra';
import { join, relative, basename } from 'path';
import {
  detectFramework,
  monorepoManagers,
  LocalFileSystemDetector,
  packageManagers,
} from '@vercel/fs-detectors';
import { ProjectLinkAndSettings } from '../projects/project-settings';
import { Output } from '../output';
import title from 'title';
import JSON5 from 'json5';

export async function setMonorepoDefaultSettings(
  cwd: string,
  workPath: string,
  projectSettings: ProjectLinkAndSettings['settings'],
  output: Output
) {
  const localFileSystem = new LocalFileSystemDetector(cwd);

  const [monorepoManager, packageManager] = await Promise.all([
    detectFramework({
      fs: localFileSystem,
      frameworkList: monorepoManagers,
    }),
    detectFramework({
      fs: localFileSystem,
      frameworkList: packageManagers,
    }),
  ]);

  const projectName = basename(workPath);
  const relativeToRoot = relative(workPath, cwd);

  const setCommand = (
    command: 'buildCommand' | 'installCommand',
    value: string
  ) => {
    if (projectSettings[command]) {
      output.warn(
        `Cannot automatically assign ${command} as it is already set via project settings or configuration overrides.`
      );
    } else {
      projectSettings[command] = value;
    }
  };

  if (monorepoManager) {
    output.log(
      `Automatically detected ${title(
        monorepoManager
      )} monorepo manager. Attempting to assign default \`buildCommand\` and \`installCommand\` settings.`
    );
  }

  if (monorepoManager === 'turbo') {
    // No ENOENT handling required here since conditional wouldn't be `true` unless `turbo.json` was found.
    const turboJSON = JSON5.parse(
      fs.readFileSync(join(cwd, 'turbo.json'), 'utf-8')
    );

    if (!turboJSON?.pipeline?.build) {
      output.warn(
        'Missing required `build` pipeline in turbo.json. Skipping automatic setting assignment.'
      );
      return;
    }

    setCommand(
      'buildCommand',
      `cd ${relativeToRoot} && npx turbo run build --filter=${projectName}...`
    );
    setCommand(
      'installCommand',
      `cd ${relativeToRoot} && ${packageManager} install`
    );
  } else if (monorepoManager === 'nx') {
    // No ENOENT handling required here since conditional wouldn't be `true` unless `nx.json` was found.
    const nxJSON = JSON5.parse(fs.readFileSync(join(cwd, 'nx.json'), 'utf-8'));

    if (!nxJSON?.targetDefaults?.build) {
      output.log(
        'Missing default `build` target in nx.json. Checking for project level Nx configuration...'
      );

      const [projectJSONBuf, packageJsonBuf] = await Promise.all([
        fs.readFile(join(workPath, 'project.json')).catch(() => null),
        fs.readFile(join(workPath, 'package.json')).catch(() => null),
      ]);

      let hasBuildTarget = false;

      if (projectJSONBuf) {
        output.log('Found project.json Nx configuration.');
        const projectJSON = JSON5.parse(projectJSONBuf.toString('utf-8'));
        if (projectJSON?.targets?.build) {
          hasBuildTarget = true;
        }
      }

      if (packageJsonBuf) {
        const packageJSON = JSON5.parse(packageJsonBuf.toString('utf-8'));
        if (packageJSON?.nx) {
          output.log('Found package.json Nx configuration.');
          if (packageJSON.nx.targets?.build) {
            hasBuildTarget = true;
          }
        }
      }

      if (!hasBuildTarget) {
        output.warn(
          'Missing required `build` target in either project.json or package.json Nx configuration. Skipping automatic setting assignment.'
        );
        return;
      }
    }

    setCommand(
      'buildCommand',
      `cd ${relativeToRoot} && npx nx build ${projectName}`
    );
    setCommand(
      'installCommand',
      `cd ${relativeToRoot} && ${packageManager} install`
    );
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
}
