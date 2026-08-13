import { TelemetryClient } from '../..';

export class ConnexNetworksTelemetryClient extends TelemetryClient {
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create',
      value: actual,
    });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'update',
      value: actual,
    });
  }

  trackCliOptionName(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'name',
        // Network names are team-controlled free-form text — redact.
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRegion(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'region',
        // Region is an enum-like identifier (e.g. iad1) — safe to record.
        value: v,
      });
    }
  }

  trackCliOptionCidr(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'cidr',
        // CIDR blocks describe private network topology — redact.
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionAvailabilityZoneId(v: string[] | undefined) {
    if (v && v.length > 0) {
      // AZ IDs are public AWS identifiers (e.g. use1-az1); record each.
      for (const az of v) {
        this.trackCliOption({
          option: 'availability-zone-id',
          value: az,
        });
      }
    }
  }

  trackCliArgumentId(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'id',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSearch(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'search',
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
}
