import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { buildCommand } from '../../../../commands/build/command';

export class BuildTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof buildCommand>
{
  trackError(code: string | undefined) {
    if (code && code !== 'Diagnostic') {
      this.trackErrorCode(code);
    }
  }

  trackCliOptionOutput(path: string | undefined) {
    if (path) {
      this.trackCliOption({
        option: 'output',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTarget(option: string | undefined) {
    if (option) {
      this.trackCliOption({
        option: 'target',
        value: this.redactedTargetName(option),
      });
    }
  }
  trackCliOptionEnvironment(environment: string | undefined) {
    if (environment) {
      this.trackCliOption({
        option: 'environment',
        value: this.redactedTargetName(environment),
      });
    }
  }

  trackCliFlagProd(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('prod');
    }
  }

  trackCliFlagYes(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagStandalone(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('standalone');
    }
  }

  trackCliOptionDeployment(deployment: string | undefined) {
    if (deployment) {
      this.trackCliOption({
        option: 'deployment',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionId(id: string | undefined) {
    if (id) {
      this.trackCliOption({
        option: 'id',
        value: this.redactedValue,
      });
    }
  }
}
