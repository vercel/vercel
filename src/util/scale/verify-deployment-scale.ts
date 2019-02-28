import ms from 'ms';

import { DeploymentScale } from '../../types';
import { Output } from '../output';
import { VerifyScaleTimeout } from '../errors-ts';
import Client from '../client';
import createPollingFn from '../create-polling-fn';
import getDeploymentInstances from '../deploy/get-deployment-instances';
import returnify from '../returnify-async-generator';
import uuid from '../uuid';

type InstancesCount = {
  [dc: string]: number;
};

type Options = {
  timeout?: number;
  pollingInterval?: number;
};

export default async function* verifyDeploymentScale(
  output: Output,
  client: Client,
  deploymentId: string,
  scale: DeploymentScale,
  options: Options = {}
) {
  const { timeout = ms('5m') } = options;
  const { pollingInterval = 2000 } = options;
  const getPollDeploymentInstances = createPollingFn(
    () => getDeploymentInstances(client, deploymentId, uuid()),
    pollingInterval
  );
  const pollDeploymentInstances = returnify(getPollDeploymentInstances);
  const currentInstancesCount = getInitialInstancesCountForScale(scale);
  const targetInstancesCount = getTargetInstancesCountForScale(scale);
  const startTime = Date.now();
  output.debug(
    `Verifying scale minimum presets to ${JSON.stringify(targetInstancesCount)}`
  );

  for await (const [error, instances] of pollDeploymentInstances) {
    if (Date.now() - startTime > timeout) {
      yield new VerifyScaleTimeout(timeout);
      break;
    }

    if (error) {
      // These ResponseErrors aren't typed yet :(
      // @ts-ignore
      if (error.status !== 'not_ready') {
        throw error;
      }
    } else if (instances) {
      // For each instance we update the current count and yield a match if ready
      for (const dc of Object.keys(instances)) {
        if (instances[dc].instances.length > currentInstancesCount[dc]) {
          currentInstancesCount[dc] = instances[dc].instances.length;
          if (currentInstancesCount[dc] >= targetInstancesCount[dc]) {
            yield [dc, currentInstancesCount[dc]] as [string, number];
          }
        }
      }

      // If all dcs are matched, finish the generator
      if (allDcsMatched(targetInstancesCount, currentInstancesCount)) {
        break;
      }
    }
  }
}

function allDcsMatched(target: InstancesCount, current: InstancesCount) {
  return Object.keys(target).reduce(
    (result, dc) => result && current[dc] >= target[dc],
    true
  );
}

function getTargetInstancesCountForScale(
  scale: DeploymentScale
): { [key: string]: number } {
  return Object.keys(scale).reduce(
    (result, dc) => ({
      ...result,
      [dc]: Math.min(Math.max(scale[dc].min, 1), scale[dc].max)
    }),
    {}
  );
}

function getInitialInstancesCountForScale(
  scale: DeploymentScale
): { [key: string]: number } {
  return Object.keys(scale).reduce(
    (result, dc) => ({
      ...result,
      [dc]: 0
    }),
    {}
  );
}
