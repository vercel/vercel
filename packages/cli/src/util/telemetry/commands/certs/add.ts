import { TelemetryClient } from '../..';

export class CertsAddTelemetryClient extends TelemetryClient {
  trackCliFlagOverwrite(v?: boolean) {
    if (v) {
      this.trackCliFlag('overwrite');
    }
  }

  trackCliOptionCrt(v?: string) {
    if (v) {
      this.trackCliOption({
        option: 'crt',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionKey(v?: string) {
    if (v) {
      this.trackCliOption({
        option: 'key',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionCa(v?: string) {
    if (v) {
      this.trackCliOption({
        option: 'ca',
        value: this.redactedValue,
      });
    }
  }
}
