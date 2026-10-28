import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { updateSubcommand } from '../../../../commands/integration/command';

export class IntegrationUpdateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof updateSubcommand>
{
  trackCliArgumentIntegration(v: string | undefined, known?: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'integration',
        value: known ? v : this.redactedValue,
      });
    }
  }

  trackCliOptionBillingPlan(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'billing-plan',
        value: this.redactedValue,
      });
    }
  }

  // The deprecated names keep their own keys, to measure who still uses them.
  trackCliOptionPlan(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'plan',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionAuthorization(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'authorization',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionAuthorizationId(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'authorization-id',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionProjects(v: string[] | undefined) {
    if (v?.length) {
      this.trackCliOption({
        option: 'projects',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionInstallation(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'installation',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionInstallationId(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'installation-id',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionFormat(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'format',
        value: v,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
