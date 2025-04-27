import type Client from '../../util/client';
import { writeToConfigFile } from '../../util/config/files';
import status from './status';

export default async function enable(client: Client) {
  client.config = {
    ...client.config,
    telemetry: {
      ...client.config.telemetry,
      enabled: true,
    },
  };

  writeToConfigFile(client.config);
  await status(client);
  return 0;
}
