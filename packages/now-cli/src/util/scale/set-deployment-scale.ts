import chalk from 'chalk';
import { DeploymentScale } from '../../types';
import { Output } from '../output';
import * as ERRORS from '../errors-ts';
import Client from '../client';
import joinWords from '../output/join-words';

type ScaleArgs = {
  min: number;
  max: number | 'auto';
};

export default async function setScale(
  output: Output,
  client: Client,
  deploymentId: string,
  scaleArgs: ScaleArgs | DeploymentScale,
  url: string
) {
  const cancelWait = output.spinner(
    `Setting scale rules for ${joinWords(
      Object.keys(scaleArgs).map(dc => `${chalk.bold(dc)}`)
    )}`
  );

  try {
    await client.fetch(
      `/v3/now/deployments/${encodeURIComponent(deploymentId)}/instances`,
      {
        method: 'PUT',
        body: scaleArgs,
      }
    );
    cancelWait();
  } catch (error) {
    cancelWait();
    if (error.code === 'forbidden_min_instances') {
      return new ERRORS.ForbiddenScaleMinInstances(url, error.max);
    }
    if (error.code === 'forbidden_max_instances') {
      return new ERRORS.ForbiddenScaleMaxInstances(url, error.max);
    }
    if (error.code === 'wrong_min_max_relation') {
      return new ERRORS.InvalidScaleMinMaxRelation(url);
    }
    if (error.code === 'not_supported_min_scale_slots') {
      return new ERRORS.NotSupportedMinScaleSlots(url);
    }
    throw error;
  }
}
