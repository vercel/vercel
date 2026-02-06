import type { microfrontendsCommand } from '../../../../commands/microfrontends/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class MicrofrontendsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof microfrontendsCommand>
{
  trackCliSubcommandPull(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'pull',
      value: actual,
    });
  }
}
