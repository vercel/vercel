import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { updateSubcommand } from '../../../../commands/domains/command';

export class DomainsUpdateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof updateSubcommand>
{
  trackCliArgumentDomain(domain: string | undefined) {
    if (domain)
      this.trackCliArgument({ arg: 'domain', value: this.redactedValue });
  }

  trackCliOptionZone(zone: string | undefined) {
    if (zone === 'true' || zone === 'false')
      this.trackCliOption({ option: 'zone', value: zone });
  }

  trackCliOptionEchMode(mode: string | undefined) {
    if (mode === 'auto' || mode === 'disabled')
      this.trackCliOption({ option: 'ech-mode', value: mode });
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) this.trackCliFlag('json');
  }
}
