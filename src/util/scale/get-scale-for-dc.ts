import { Deployment } from '../../types';

export default function getScaleForDC(dc: string, deployment: Deployment) {
  if (
    deployment.type !== 'STATIC' &&
    deployment.scale &&
    deployment.scale[dc]
  ) {
    return {
      min: deployment.scale[dc].min,
      max: deployment.scale[dc].max
    };
  }

  return {
    min: null,
    max: null
  };
}
