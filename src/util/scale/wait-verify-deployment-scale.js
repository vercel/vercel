import chalk from 'chalk';
import plural from 'pluralize';
import chars from '../output/chars';
import { VerifyScaleTimeout } from "../errors";
import joinWords from '../output/join-words';
import stamp from '../output/stamp';
import wait from '../output/wait';
import verifyDeploymentScale from './verify-deployment-scale';

async function waitForScale(
  output        ,
  now     ,
  deploymentId        ,
  scale
) {
  const remainingDCs = new Set(Object.keys(scale));
  const scaleStamp = stamp();
  let cancelWait = renderWaitDcs(Array.from(remainingDCs.keys()));

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
      cancelWait = renderWaitDcs(Array.from(remainingDCs.keys()));
    }
  }
}

function renderWaitDcs(dcs          ) {
  return wait(
    `Waiting for instances in ${joinWords(
      dcs.map(dc => chalk.bold(dc))
    )} to be ready`
  );
}

export default waitForScale;
