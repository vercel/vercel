import type Client from '../../util/client';
import { printError } from '../../util/error';
import { emitFlagsDatafiles } from '../build/emit-flags-datafiles';

export default async function emitDatafiles(client: Client): Promise<number> {
  try {
    await emitFlagsDatafiles(client.cwd, process.env);
    return 0;
  } catch (err) {
    printError(err);
    return 1;
  }
}
