import chalk from 'chalk';
import plural from 'pluralize';

import { DeploymentScale } from '../../types';
import { Output } from '../output';
import { VerifyScaleTimeout } from '../errors-ts';
import chars from '../output/chars';
import Client from '../client';
import joinWords from '../output/join-words';
import stamp from '../output/stamp';
import verifyDeploymentScale from './verify-deployment-scale';

export default async function waitForScale(
  output: Output,
  now: Client,
  deploymentId: string,
  scale: DeploymentScale
) {
  const remainingDCs = new Set(Object.keys(scale));
  const scaleStamp = stamp();
  let cancelWait = renderWaitDcs(output, Array.from(remainingDCs.keys()));

  for await (const dcReady of verifyDeploymentScale(
    output,
    now,
    deploymentId,
    scale
  )) {
    cancelWait();
    if (Array.isArray(dcReady)) {
      const [dc, instances] = dcReady;
      remainingDCs.delete(dc);
      output.log(
        `${chalk.cyan(chars.tick)} Scaled ${plural(
          'instance',
          instances,
          true
        )} in ${chalk.bold(dc)} ${scaleStamp()}`
      );
    } else if (dcReady instanceof VerifyScaleTimeout) {
      return dcReady;
    }

    if (remainingDCs.size > 0) {
      cancelWait = renderWaitDcs(output, Array.from(remainingDCs.keys()));
    }
  }
}

function renderWaitDcs(output: Output, dcs: string[]) {
  return output.spinner(
    `Waiting for instances in ${joinWords(
      dcs.map(dc => chalk.bold(dc))
    )} to be ready`
  );
}
