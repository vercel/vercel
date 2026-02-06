import type { pullSubcommand } from '../../../../commands/microfrontends/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class MicrofrontendsPullTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof pullSubcommand>
{
  trackCliOptionDpl(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'dpl',
        value: this.redactedValue,
      });
    }
  }
}
