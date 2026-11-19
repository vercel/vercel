import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type {
  inferenceHooksDisableSubcommand,
  inferenceHooksEnableSubcommand,
  inferenceHooksRemoveSubcommand,
  inferenceHooksSetSubcommand,
  inferenceHooksSigningSecretCreateSubcommand,
  inferenceHooksSigningSecretRotateSubcommand,
  inferenceHooksSigningSecretSubcommand,
  inferenceHooksStatusSubcommand,
  inferenceHooksSubcommand,
  inferenceHooksTestSubcommand,
} from '../../../../commands/ai-gateway/command';
import {
  INFERENCE_HOOK_FAILURE_MODES,
  INFERENCE_HOOK_MODES,
} from '../../../ai-gateway/inference-hooks';

export class AiGatewayInferenceHooksTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof inferenceHooksSubcommand>
{
  trackCliSubcommandStatus(actual: string) {
    this.trackCliSubcommand({ subcommand: 'status', value: actual });
  }
  trackCliSubcommandSet(actual: string) {
    this.trackCliSubcommand({ subcommand: 'set', value: actual });
  }
  trackCliSubcommandEnable(actual: string) {
    this.trackCliSubcommand({ subcommand: 'enable', value: actual });
  }
  trackCliSubcommandDisable(actual: string) {
    this.trackCliSubcommand({ subcommand: 'disable', value: actual });
  }
  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({ subcommand: 'remove', value: actual });
  }
  trackCliSubcommandSigningSecret(actual: string) {
    this.trackCliSubcommand({ subcommand: 'signing-secret', value: actual });
  }
  trackCliSubcommandTest(actual: string) {
    this.trackCliSubcommand({ subcommand: 'test', value: actual });
  }
}

export class AiGatewayInferenceHooksSigningSecretTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof inferenceHooksSigningSecretSubcommand>
{
  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'create', value: actual });
  }
  trackCliSubcommandRotate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'rotate', value: actual });
  }
}

/**
 * Option tracking shared by the leaves. Only `--mode` and `--failure-mode`
 * values are recorded, and only when known: a URL or header can hold a token.
 */
export class InferenceHooksLeafTelemetryClient extends TelemetryClient {
  /** Records every option a leaf parsed, through the methods below. */
  trackParsedOptions(flags: Record<string, unknown>) {
    this.trackCliOptionEndpointUrl(flags['--endpoint-url'] as string);
    this.trackCliOptionMode(flags['--mode'] as string);
    this.trackCliOptionFailureMode(flags['--failure-mode'] as string);
    this.trackCliOptionTimeoutMs(flags['--timeout-ms'] as number);
    this.trackCliOptionRolloutPercent(flags['--rollout-percent'] as number);
    this.trackCliOptionHeader(flags['--header'] as string[]);
    this.trackCliFlagClearHeaders(flags['--clear-headers'] as boolean);
    this.trackCliFlagYes(flags['--yes'] as boolean);
    this.trackCliFlagJson(flags['--json'] as boolean);
  }

  trackCliOptionEndpointUrl(value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'endpoint-url',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionMode(value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'mode',
        value: (INFERENCE_HOOK_MODES as readonly string[]).includes(value)
          ? value
          : this.redactedValue,
      });
    }
  }
  trackCliOptionFailureMode(value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'failure-mode',
        value: (INFERENCE_HOOK_FAILURE_MODES as readonly string[]).includes(
          value
        )
          ? value
          : this.redactedValue,
      });
    }
  }
  trackCliOptionTimeoutMs(value: number | undefined) {
    if (value !== undefined) {
      this.trackCliOption({ option: 'timeout-ms', value: this.redactedValue });
    }
  }
  trackCliOptionRolloutPercent(value: number | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'rollout-percent',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionHeader(value: [string] | string[] | undefined) {
    if (value?.length) {
      this.trackCliOption({ option: 'header', value: this.redactedValue });
    }
  }
  trackCliFlagClearHeaders(value: boolean | undefined) {
    if (value) this.trackCliFlag('clear-headers');
  }
  trackCliFlagYes(value: boolean | undefined) {
    if (value) this.trackCliFlag('yes');
  }
  trackCliFlagJson(value: boolean | undefined) {
    if (value) this.trackCliFlag('json');
  }
}

export class AiGatewayInferenceHooksStatusTelemetryClient
  extends InferenceHooksLeafTelemetryClient
  implements TelemetryMethods<typeof inferenceHooksStatusSubcommand> {}

export class AiGatewayInferenceHooksSetTelemetryClient
  extends InferenceHooksLeafTelemetryClient
  implements TelemetryMethods<typeof inferenceHooksSetSubcommand> {}

export class AiGatewayInferenceHooksEnableTelemetryClient
  extends InferenceHooksLeafTelemetryClient
  implements TelemetryMethods<typeof inferenceHooksEnableSubcommand> {}

export class AiGatewayInferenceHooksDisableTelemetryClient
  extends InferenceHooksLeafTelemetryClient
  implements TelemetryMethods<typeof inferenceHooksDisableSubcommand> {}

export class AiGatewayInferenceHooksRemoveTelemetryClient
  extends InferenceHooksLeafTelemetryClient
  implements TelemetryMethods<typeof inferenceHooksRemoveSubcommand> {}

export class AiGatewayInferenceHooksSigningSecretCreateTelemetryClient
  extends InferenceHooksLeafTelemetryClient
  implements
    TelemetryMethods<typeof inferenceHooksSigningSecretCreateSubcommand> {}

export class AiGatewayInferenceHooksSigningSecretRotateTelemetryClient
  extends InferenceHooksLeafTelemetryClient
  implements
    TelemetryMethods<typeof inferenceHooksSigningSecretRotateSubcommand> {}

export class AiGatewayInferenceHooksTestTelemetryClient
  extends InferenceHooksLeafTelemetryClient
  implements TelemetryMethods<typeof inferenceHooksTestSubcommand> {}
