import { CheckboxChoiceOptions } from 'inquirer';
import Client from '../client';
import { RepoProjectsConfig } from '../link/repo';
import {
  getWorkspaces,
  LocalFileSystemDetector,
  getWorkspacePackagePaths,
} from '@vercel/fs-detectors';
import path from 'path';

export async function projectSelector(
  client: Client,
  cwd: string,
  repoConfig?: RepoProjectsConfig,
  autoConfirm: boolean = false
) {
  require('./patch-inquirer');

  const choices: Array<CheckboxChoiceOptions> = [];

  if (repoConfig) {
    for (const project of repoConfig.projects) {
      choices.push({
        name: project.name,
        value: project.directory,
        checked: true,
      });
    }
  } else {
    const localFS = new LocalFileSystemDetector(cwd);
    const workspaces = await getWorkspaces({ fs: localFS });
    const packagesPaths = await Promise.all(
      workspaces.map(workspace =>
        getWorkspacePackagePaths({ fs: localFS, workspace })
      )
    );
    const packages = await Promise.all(
      packagesPaths.flat().map(async packagePath => {
        const packagePackageJSONBuffer = await localFS
          .readFile(path.join(packagePath, 'package.json'))
          .catch(() => null);
        return {
          name:
            (packagePackageJSONBuffer &&
              JSON.parse(packagePackageJSONBuffer.toString('utf-8'))?.name) ??
            packagePath,
          value: packagePath,
        };
      })
    );

    for (const pkg of packages) {
      choices.push(pkg);
    }
  }

  if (autoConfirm) {
    return choices.filter(choice => choice.checked).map(choice => choice.value);
  } else {
    const answers = await client.prompt({
      type: 'checkbox',
      name: 'projects',
      message: 'Select projects',
      choices,
    });

    return answers.projects;
  }
}
