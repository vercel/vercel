import { TelemetryClient } from '../..';

export class FlagsDisableTelemetryClient extends TelemetryClient {
  trackCliArgumentFlag(flag: string | undefined) {
    if (flag) {
      this.trackCliArgument({
        arg: 'flag',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEnvironment(environment: string | undefined) {
    if (environment) {
      this.trackCliOption({
        option: 'environment',
        value: environment,
      });
    }
  }

  trackCliOptionVariant(variant: string | undefined) {
    if (variant) {
      this.trackCliOption({
        option: 'variant',
        value: this.redactedValue,
      });
    }
  }
}
