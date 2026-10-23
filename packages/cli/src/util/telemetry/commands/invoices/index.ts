import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type {
  invoicesCommand,
  listSubcommand,
  upcomingSubcommand,
} from '../../../../commands/invoices/command';

export class InvoicesTelemetryClient
  extends TelemetryClient
  implements
    TelemetryMethods<typeof invoicesCommand>,
    TelemetryMethods<typeof listSubcommand>,
    TelemetryMethods<typeof upcomingSubcommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandUpcoming(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'upcoming',
      value: actual,
    });
  }

  trackCliOptionStatus(status: string[] | undefined) {
    if (status) {
      this.trackCliOption({
        option: 'status',
        value: status.join(','),
      });
    }
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit) {
      this.trackCliOption({
        option: 'limit',
        value: String(limit),
      });
    }
  }

  trackCliOptionNext(next: string | undefined) {
    if (next) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagDetails(details: boolean | undefined) {
    if (details) {
      this.trackCliFlag('details');
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
