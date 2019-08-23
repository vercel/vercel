import { DockerDeployment, NpmDeployment } from '../../types';

export default function getDeploymentDownscalePresets(
  deployment: DockerDeployment | NpmDeployment
) {
  return Object.keys(deployment.scale).reduce(
    (result, dc) =>
      Object.assign(result, {
        [dc]: { min: 0, max: 1 }
      }),
    {}
  );
}
