import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { sandboxCommand } from '../../../../commands/sandbox/command';

export class SandboxTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof sandboxCommand> {}
