import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { typesSubcommand } from '../../../../commands/activity/command';

export class ActivityTypesTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof typesSubcommand> {}
