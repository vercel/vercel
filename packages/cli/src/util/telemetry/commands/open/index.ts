import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { openCommand } from '../../../../commands/open/command';

export class OpenTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof openCommand>
{
  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliCommandOpen(value: string) {
    this.trackCliCommand({
      command: 'open',
      value,
    });
  }
}
