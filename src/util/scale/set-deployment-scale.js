// @flow
import chalk from 'chalk';
import wait from '../output/wait';
import joinWords from '../output/join-words';
import { Output, Now } from '../types';
import type { DeploymentScaleArgs, DeploymentScale } from '../types';
import * as Errors from '../errors';

async function setScale(
  output: Output,
  now: Now,
  deploymentId: string,
  scaleArgs: DeploymentScaleArgs | DeploymentScale,
  url: string
) {
  const cancelWait = wait(
    `Setting scale rules for ${joinWords(
      Object.keys(scaleArgs).map(dc => `${chalk.bold(dc)}`)
    )}`
  );

  try {
    await now.fetch(
      `/v3/now/deployments/${encodeURIComponent(deploymentId)}/instances`,
      {
        method: 'PUT',
        body: scaleArgs
      }
    );
    cancelWait();
  } catch (error) {
    cancelWait();
    if (error.code === 'forbidden_min_instances') {
      return new Errors.ForbiddenScaleMinInstances(url, error.min);
    } else if (error.code === 'forbidden_max_instances') {
      return new Errors.ForbiddenScaleMaxInstances(url, error.max);
    } else if (error.code === 'wrong_min_max_relation') {
      return new Errors.InvalidScaleMinMaxRelation(url);
    } else if (error.code === 'not_supported_min_scale_slots') {
      return new Errors.NotSupportedMinScaleSlots(url);
    } else {
      throw error;
    }
  }
}

export default setScale;
