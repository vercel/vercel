import { TelemetryClient } from '../..';

export class DnsRmTelemetryClient extends TelemetryClient {
  trackCliArgumentRecordId(recordId?: string) {
    if (recordId) {
      this.trackCliArgument({
        arg: 'recordId',
        value: this.redactedValue,
      });
    }
  }
}
