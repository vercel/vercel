import { TelemetryClient } from '../..';
import type { listStoresSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobListStoresTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listStoresSubcommand> {}
