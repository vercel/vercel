import { loadEnvConfig } from '@next/env';
import output from '../../output-manager';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { emitFlagsDatafiles } from '../build/emit-flags-datafiles';

export default async function emitDatafiles(client: Client): Promise<number> {
  try {
    let localEnv: Record<string, string | undefined> = {};
    try {
      localEnv = loadEnvConfig(client.cwd, true).combinedEnv;
    } catch (err) {
      output.debug(`Failed to load local env files: ${err}`);
    }

    await emitFlagsDatafiles(client.cwd, { ...localEnv, ...process.env });
    return 0;
  } catch (err) {
    printError(err);
    return 1;
  }
}
