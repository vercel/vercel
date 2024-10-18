import { TelemetryClient } from '../..';

export class AliasRmTelemetryClient extends TelemetryClient {
  trackCliArgumentAlias(alias?: string) {
    if (alias) {
      this.trackCliArgument({
        arg: 'alias',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes?: boolean) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
