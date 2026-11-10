import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type {
  contactsAddSubcommand,
  contactsSubcommand,
} from '../../../../commands/connex/command';

export class ContactsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof contactsSubcommand>
{
  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({ subcommand: 'add', value: actual });
  }
}

export class ContactsAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof contactsAddSubcommand>
{
  trackCliArgumentConnector(v: string | undefined) {
    if (v) {
      this.trackCliArgument({ arg: 'connector', value: this.redactedValue });
    }
  }

  trackCliOptionPhoneNumber(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'phone-number',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionFormat(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'format', value: v });
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }
}
