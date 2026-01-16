import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { oidcCommand } from '../../../../commands/oidc/command';

export class OidcTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof oidcCommand>
{
  trackCliSubcommandToken(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'token',
      value: actual,
    });
  }
}
