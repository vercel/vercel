import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { pullSubcommand } from '../../../../commands/microfrontends/command';

export class MicrofrontendsPullTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof pullSubcommand>
{
  trackCliOptionDpl(value: string | undefined) {
    this.trackCliOption({
      option: '--dpl',
      value: value ?? '',
    });
  }
}
