import { TelemetryClient } from '../..';

export class FlagsConnectionsTelemetryClient extends TelemetryClient {
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ls',
      value: actual,
    });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'rm',
      value: actual,
    });
  }
}

export class FlagsConnectionsLsTelemetryClient extends TelemetryClient {
  trackCliOptionRole(role: string | undefined) {
    if (role) {
      this.trackCliOption({
        option: 'role',
        value: role,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}

export class FlagsConnectionsAddTelemetryClient extends TelemetryClient {
  trackCliArgumentConsumerProject(project: string | undefined) {
    if (project) {
      this.trackCliArgument({
        arg: 'consumer-project',
        value: this.redactedValue,
      });
    }
  }
}

export class FlagsConnectionsRmTelemetryClient extends TelemetryClient {
  trackCliArgumentConsumerProject(project: string | undefined) {
    if (project) {
      this.trackCliArgument({
        arg: 'consumer-project',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
