import { TelemetryClient } from '../..';
import type { updateSubcommand } from '../../../../commands/flags/command';
import type { TelemetryMethods } from '../../types';

export class FlagsUpdateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof updateSubcommand>
{
  trackCliArgumentFlag(flag: string | undefined) {
    if (flag) {
      this.trackCliArgument({
        arg: 'flag',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionVariant(variant: string | undefined) {
    if (variant) {
      this.trackCliOption({
        option: 'variant',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionValue(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'value',
        value: this.redactedValue,
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

  trackCliOptionAddVariant(addVariant: string[] | undefined) {
    if (addVariant?.length) {
      this.trackCliOption({
        option: 'add-variant',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRemoveVariant(removeVariant: string[] | undefined) {
    if (removeVariant?.length) {
      this.trackCliOption({
        option: 'remove-variant',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionMessage(message: string | undefined) {
    if (message) {
      this.trackCliOption({
        option: 'message',
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
