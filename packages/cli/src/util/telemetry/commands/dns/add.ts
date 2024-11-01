import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { addSubcommand } from '../../../../commands/dns/command';

export class DnsAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
{
  trackCliArgumentDomain(domain: string | undefined) {
    if (domain) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  // This function is intentionally not implemented because the functions
  // defined below are used instead, depending on the type of DNS record.
  trackCliArgumentDetails!: (value: string | undefined) => void;

  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentType(type: string | undefined) {
    if (type) {
      this.trackCliArgument({
        arg: 'type',
        value: type,
      });
    }
  }

  trackCliArgumentValues(values: string[] | undefined) {
    if (values?.length) {
      this.trackCliArgument({
        arg: 'values',
        value: this.redactedValue,
      });
    }
  }
}
