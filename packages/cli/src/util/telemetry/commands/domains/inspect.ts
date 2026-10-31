import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { inspectSubcommand } from '../../../../commands/domains/command';

export class DomainsInspectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof inspectSubcommand>
{
  trackCliArgumentDomain(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: this.redactedValue });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) this.trackCliFlag('json');
  }
}
