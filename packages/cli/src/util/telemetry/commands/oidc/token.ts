import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { tokenSubcommand } from '../../../../commands/oidc/command';

export class OidcTokenTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof tokenSubcommand>
{
  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }

  trackCliOptionProject(project: string | undefined) {
    if (project) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }
}
