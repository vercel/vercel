import { TelemetryClient } from '../..';

export class FlagsSdkKeysTelemetryClient extends TelemetryClient {
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

export class FlagsSdkKeysLsTelemetryClient extends TelemetryClient {
  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}

export class FlagsSdkKeysAddTelemetryClient extends TelemetryClient {
  trackCliOptionType(type: string | undefined) {
    if (type) {
      this.trackCliOption({
        option: 'type',
        value: type,
      });
    }
  }

  trackCliOptionEnvironment(environment: string | undefined) {
    if (environment) {
      this.trackCliOption({
        option: 'environment',
        value: environment,
      });
    }
  }

  trackCliOptionLabel(label: string | undefined) {
    if (label) {
      this.trackCliOption({
        option: 'label',
        value: this.redactedValue,
      });
    }
  }
}

export class FlagsSdkKeysRmTelemetryClient extends TelemetryClient {
  trackCliArgumentKey(key: string | undefined) {
    if (key) {
      this.trackCliArgument({
        arg: 'key',
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
