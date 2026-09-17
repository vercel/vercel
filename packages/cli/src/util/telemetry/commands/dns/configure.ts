import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { configureSubcommand } from '../../../../commands/dns/command';

export class DnsConfigureTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof configureSubcommand>
{
  trackCliArgumentDomain(value: string | undefined) {
    if (value)
      this.trackCliArgument({ arg: 'domain', value: this.redactedValue });
  }
  trackCliOptionResend(value: string | undefined) {
    if (value)
      this.trackCliOption({ option: 'resend', value: this.redactedValue });
  }
  trackCliFlagYes(value: boolean | undefined) {
    if (value) this.trackCliFlag('yes');
  }
  trackCliFlagDryRun(value: boolean | undefined) {
    if (value) this.trackCliFlag('dry-run');
  }
  trackCliOptionFormat(value: string | undefined) {
    if (value) this.trackCliOption({ option: 'format', value });
  }
  trackCliFlagJson(value: boolean | undefined) {
    if (value) this.trackCliFlag('json');
  }
}
