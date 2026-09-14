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

  trackCliOptionRootDirectory(value: string | undefined) {
    this.trackSettingOption('root-directory', value);
  }

  trackCliOptionAutoDetect(value: [string] | undefined) {
    if (value?.length) {
      this.trackCliOption({
        option: 'auto-detect',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSandboxRegion(value: string | undefined) {
    this.trackSandboxRegionOption('sandbox-region', value);
  }

  trackCliOptionSandboxFailoverRegions(value: string | undefined) {
    this.trackSandboxRegionOption('sandbox-failover-regions', value);
  }

  private trackSandboxRegionOption(option: string, value: string | undefined) {
    if (value === undefined) {
      return;
    }
    this.trackCliOption({
      option,
      value: this.redactedValue,
    });
  }

  private trackSettingOption(option: string, value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option,
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionFluidCompute(value: string | undefined) {
    this.trackChoiceOption('fluid-compute', value, ['on', 'off']);
  }

  trackCliOptionFunctionCpu(value: string | undefined) {
    this.trackChoiceOption('function-cpu', value, [
      'standard_legacy',
      'standard',
      'performance',
      'performance_xl',
    ]);
  }

  trackCliOptionBuildMachine(value: string | undefined) {
    this.trackChoiceOption('build-machine', value, [
      'basic',
      'standard',
      'enhanced',
      'turbo',
      'elastic',
    ]);
  }

  trackCliOptionElasticConcurrency(value: string | undefined) {
    this.trackChoiceOption('elastic-concurrency', value, ['on', 'off']);
  }

  trackCliOptionNodeVersion(value: string | undefined) {
    this.trackChoiceOption('node-version', value, [
      '24.x',
      '22.x',
      '20.x',
      '18.x',
      '16.x',
      '14.x',
      '12.x',
      '10.x',
    ]);
  }

  private trackChoiceOption(
    option: string,
    value: string | undefined,
    allowed: readonly string[]
  ) {
    if (value !== undefined) {
      this.trackCliOption({
        option,
        value: allowed.includes(value) ? value : this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
