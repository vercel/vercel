import chalk from 'chalk';
import joinWords from '../output/join-words';
import * as Errors from '../errors-ts';
import { Output } from '../output';
import Client from '../client';

type ScaleArgs = {
  min: number;
  max: number | 'auto';
};

export default async function patchDeploymentScale(
  output: Output,
  client: Client,
  deploymentId: string,
  scaleArgs: ScaleArgs,
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
        method: 'PATCH',
        body: scaleArgs,
      }
    );
    cancelWait();
  } catch (error) {
    cancelWait();
    if (error.code === 'forbidden_min_instances') {
      return new Errors.ForbiddenScaleMinInstances(url, error.max);
    }
    if (error.code === 'forbidden_max_instances') {
      return new Errors.ForbiddenScaleMaxInstances(url, error.max);
    }
    if (error.code === 'wrong_min_max_relation') {
      return new Errors.InvalidScaleMinMaxRelation(url);
    }
    if (error.code === 'not_supported_min_scale_slots') {
      return new Errors.NotSupportedMinScaleSlots(url);
    }
    if (error.code === 'deployment_type_unsupported') {
      return new Errors.DeploymentTypeUnsupported();
    }

    throw error;
  }
}
