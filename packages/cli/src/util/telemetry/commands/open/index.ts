import type { openCommand } from '../../../../commands/open/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class OpenTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof openCommand>
{
  trackCliCommandOpen(value: string) {
    this.trackCliCommand({
      command: 'open',
      value,
    });
  }
}
