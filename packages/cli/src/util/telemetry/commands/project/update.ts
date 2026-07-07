import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { updateSubcommand } from '../../../../commands/project/command';

export class ProjectUpdateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof updateSubcommand>
{
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionFramework(framework: string | undefined) {
    if (framework) {
      this.trackCliOption({
        option: 'framework',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionBuildCommand(value: string | undefined) {
    this.trackSettingOption('build-command', value);
  }

  trackCliOptionDevCommand(value: string | undefined) {
    this.trackSettingOption('dev-command', value);
  }

  trackCliOptionInstallCommand(value: string | undefined) {
    this.trackSettingOption('install-command', value);
  }

  trackCliOptionOutputDirectory(value: string | undefined) {
    this.trackSettingOption('output-directory', value);
  }

  trackCliOptionAutoDetect(value: [string] | undefined) {
    if (value?.length) {
      this.trackCliOption({
        option: 'auto-detect',
        value: this.redactedValue,
      });
    }
  }

  private trackSettingOption(option: string, value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option,
        value: this.redactedValue,
      });
    }
  }
}
