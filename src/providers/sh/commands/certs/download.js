// @flow
import chalk from 'chalk'

import Now from '../../util'
import path from 'path'
import stamp from '../../../../util/output/stamp'
import { CLIContext, Output } from '../../util/types'
import getCertById from '../../util/certs/get-cert-by-id'
import saveCert from '../../util/certs/save-cert';
import type { CLICertsOptions } from '../../util/types'

async function download(ctx: CLIContext, opts: CLICertsOptions, args: string[], output: Output): Promise<number> {
  const {authConfig: { credentials }, config: { sh }} = ctx
  const { currentTeam } = sh;
  const { apiUrl } = ctx;

  // $FlowFixMe
  const {token} = credentials.find(item => item.provider === 'sh')
  const now = new Now({ apiUrl, token, debug: opts['--debug'], currentTeam })
  const downloadStamp = stamp()

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        '`now certs download <id> -o path-to-save`'
      )}`
    );
    now.close();
    return 1;
  }

  const id = args[0]
  const outputPath = opts['--output'] || '';
  const resolvedPath = path.resolve(process.cwd(), outputPath);
  const basename = path.basename(resolvedPath);

  if (basename.includes('.')) {
    output.error(
      `Please use a directory as a path instead of a file path. Usage: ${chalk.cyan(
        '`now certs download <id> -o path`'
      )}`
    );
    now.close();
    return 1;
  }

  const cert = await getCertById(output, now, id);
  try {
    await saveCert(resolvedPath, cert);
  } catch (error) {
    output.error(`The cert ${cert.uid} could not be saved. ${error.message}`)
    return 1
  }

  output.success(`Certificate saved in ${chalk.gray(resolvedPath)} ${downloadStamp()}`)
  return 0
}

export default download
