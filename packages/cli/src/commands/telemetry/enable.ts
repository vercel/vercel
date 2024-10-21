import Client from '../../util/client';
import { writeToConfigFile } from '../../util/config/files';
import status from './status';
import output from '../../output-manager';

export default async function enable(client: Client) {
  client.config = {
    ...client.config,
    telemetry: {
      ...client.config.telemetry,
      enabled: true,
    },
  };

  writeToConfigFile(output, client.config);
  await status(client);
  return 0;
}
