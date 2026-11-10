import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { pullSubcommand } from '../../../../commands/microfrontends/command';

export class MicrofrontendsPullTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof pullSubcommand>
{
  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliOptionDeployment(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'deployment',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionDpl(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'dpl',
        value: this.redactedValue,
      });
    }
  }
}
