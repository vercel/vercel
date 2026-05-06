import path from 'node:path';
import * as config from '@vercel/cli-config';
import { parseArguments } from '../../util/get-args';

export default function getGlobalPathConfig(
  argvSlice: string[] = process.argv.slice(2),
  cwd: string = process.cwd()
): string {
  const args = parseArguments(argvSlice, {}, { permissive: true });
  const confFlag = args.flags['--global-config'];
  if (confFlag) {
    return path.resolve(cwd, confFlag);
  } else {
    return config.getGlobalPathConfig();
  }
}
