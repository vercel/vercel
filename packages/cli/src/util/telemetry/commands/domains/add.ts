import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { addSubcommand } from '../../../../commands/domains/command';

export class DomainsAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
{
  trackCliOptionRedirect(value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({ option: 'redirect', value: this.redactedValue });
    }
  }

  trackCliOptionRedirectStatusCode(value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'redirect-status-code',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagForce(force: boolean | undefined) {
    if (force) {
      this.trackCliFlag('force');
    }
  }

  trackCliArgumentDomain(domainName: string | undefined) {
    if (domainName) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentProject(projectName: string | undefined) {
    if (projectName) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }
}
