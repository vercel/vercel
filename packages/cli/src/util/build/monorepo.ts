import { relative, basename } from 'path';
import {
  LocalFileSystemDetector,
  getMonorepoDefaultSettings,
  MissingBuildPipeline,
  MissingBuildTarget,
} from '@vercel/fs-detectors';
import { ProjectLinkAndSettings } from '../projects/project-settings';
import { Output } from '../output';
import title from 'title';
import { PartialProjectSettings } from '../input/edit-project-settings';
import { debug } from '@vercel/build-utils';

export async function setMonorepoDefaultSettings(
  cwd: string,
  workPath: string,
  projectSettings: ProjectLinkAndSettings['settings'] & PartialProjectSettings,
  output: Output
) {
  const localFileSystem = new LocalFileSystemDetector(cwd);

  const projectName = basename(workPath);
  const relativeToRoot = relative(workPath, cwd);

  const setCommand = (
    command: 'buildCommand' | 'installCommand' | 'commandForIgnoringBuildStep',
    value: string
  ) => {
    if (projectSettings[command]) {
      debug(
        `Skipping auto-assignment of ${command} as it is already set via project settings or configuration overrides.`
      );
    } else {
      projectSettings[command] = value;
    }
  };

  try {
    const result = await getMonorepoDefaultSettings(
      projectName,
      relative(cwd, workPath),
      relativeToRoot,
      localFileSystem
    );

    if (result === null) {
      return;
    }

    const { monorepoManager, ...commands } = result;

    output.log(
      `Detected ${title(monorepoManager)}. Adjusting default settings...`
    );

    if (commands.buildCommand) {
      setCommand('buildCommand', commands.buildCommand);
    }
    if (commands.installCommand) {
      setCommand('installCommand', commands.installCommand);
    }
    if (commands.commandForIgnoringBuildStep) {
      setCommand(
        'commandForIgnoringBuildStep',
        commands.commandForIgnoringBuildStep
      );
    }
  } catch (error) {
    if (
      error instanceof MissingBuildPipeline ||
      error instanceof MissingBuildTarget
    ) {
      output.warn(`${error.message} Skipping automatic setting assignment.`);
      return;
    }

    throw error;
  }
}
