import getUpdateCommand from '../get-update-command';
import { getTitleName } from '../pkg-name';
import { dev } from './diagnostics';

export async function getUnsupportedBuilderVersionError(
  version: unknown
): Promise<Error> {
  let updateMessage: string;
  try {
    const updateCommand = await getUpdateCommand();
    updateMessage = `Please run \`${updateCommand}\` to update to the latest CLI.`;
  } catch (error) {
    updateMessage =
      error instanceof Error
        ? error.message
        : 'Update the CLI with the package manager that installed it.';
  }
  return dev.DEV_UNSUPPORTED_BUILDER_VERSION({
    titleName: getTitleName(),
    version,
    updateMessage,
  });
}
