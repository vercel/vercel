import { TelemetryClient } from '../..';

export class AliasRmTelemetryClient extends TelemetryClient {
  trackCliArgumentAlias(alias: string | undefined) {
    if (alias) {
      this.trackCliArgument({
        arg: 'alias',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
