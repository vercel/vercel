import type Client from '../../util/client';
import { writeToConfigFile } from '../../util/config/files';
import status from './status';

export default async function disable(client: Client) {
  client.config = {
    ...client.config,
    telemetry: {
      ...client.config.telemetry,
      enabled: false,
    },
  };

  writeToConfigFile(client.config);
  await status(client);
  return 0;
}
