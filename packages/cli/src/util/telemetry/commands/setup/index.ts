import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { setupCommand } from '../../../../commands/setup/command';

export class SetupTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof setupCommand>
{
  trackCliSubcommandPlugin(actual: string) {
    this.trackCliSubcommand({ subcommand: 'plugin', value: actual });
  }

  trackCliSubcommandGateway(actual: string) {
    this.trackCliSubcommand({ subcommand: 'gateway', value: actual });
  }

  trackCliSubcommandSkills(actual: string) {
    this.trackCliSubcommand({ subcommand: 'skills', value: actual });
  }

  trackCliOptionAgent(agents: [string] | undefined) {
    for (const agent of agents ?? []) {
      this.trackCliOption({ option: 'agent', value: agent });
    }
  }

  trackCliFlagPlugin(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('plugin');
    }
  }

  trackCliFlagGateway(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('gateway');
    }
  }

  trackCliFlagDryRun(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('dry-run');
    }
  }

  trackCliFlagAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('all');
    }
  }

  trackCliOptionKey(v: string | undefined) {
    // The key is a secret: record only that it was passed.
    if (v !== undefined) {
      this.trackCliOption({ option: 'key', value: this.redactedValue });
    }
  }

  trackCliFlagReconfigure(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('reconfigure');
    }
  }

  trackCliFlagNoSessionMigration(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('no-session-migration');
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }
}
