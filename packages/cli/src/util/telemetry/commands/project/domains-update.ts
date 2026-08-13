import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { domainsUpdateSubcommand } from '../../../../commands/project/command';

export class ProjectDomainsUpdateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof domainsUpdateSubcommand>
{
  trackCliArgumentDomain(domain: string | undefined) {
    if (domain) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionGitBranch(value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'git-branch',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEnvironment(value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'environment',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRedirect(value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'redirect',
        value: this.redactedValue,
      });
    }
  }

  // Redirect status is a fixed enum of HTTP codes, so the value is safe to record.
  trackCliOptionRedirectStatus(value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'redirect-status',
        value: value === '' ? this.redactedValue : value,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
