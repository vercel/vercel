import { loadEnvConfig } from '@next/env';
import { prepareFlagsDefinitions } from '@vercel/prepare-flags-definitions';
import output from '../../output-manager';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import ua from '../../util/ua';
import { prepareSubcommand } from './command';

export default async function emitDatafiles(client: Client): Promise<number> {
  try {
    parseArguments(
      client.argv.slice(4),
      getFlagsSpecification(prepareSubcommand.options)
    );
  } catch (err) {
    printError(err);
    return 2;
  }

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
