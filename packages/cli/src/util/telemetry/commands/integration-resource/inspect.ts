import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { inspectSubcommand } from '../../../../commands/integration-resource/command';

export class IntegrationResourceInspectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof inspectSubcommand>
{
  trackCliArgumentResource(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'resource',
        value: this.redactedValue,
      });
    }
  }
}
