import { loadEnvConfig } from '@next/env';
import { prepareFlagsDefinitions } from '@vercel/prepare-flags-definitions';
import output from '../../output-manager';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import ua from '../../util/ua';

export default async function emitDatafiles(client: Client): Promise<number> {
  try {
    let localEnv: Record<string, string | undefined> = {};
    try {
      localEnv = loadEnvConfig(client.cwd, true).combinedEnv;
    } catch (err) {
      output.debug(`Failed to load local env files: ${err}`);
    }

    await prepareFlagsDefinitions({
      cwd: client.cwd,
      env: { ...localEnv, ...process.env },
      userAgentSuffix: ua,
      output,
    });
    return 0;
  } catch (err) {
    printError(err);
    return 1;
  }
}
