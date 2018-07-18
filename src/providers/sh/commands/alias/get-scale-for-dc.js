// @flow
import type { Scale, NpmDeployment, BinaryDeployment, DockerDeployment } from '../../util/types'

function getScaleForDC(dc: string, deployment: NpmDeployment | BinaryDeployment | DockerDeployment) {
  const dcAttrs = deployment.scale && deployment.scale[dc] || {}
  const safeScale: Scale = { min: dcAttrs.min, max: dcAttrs.max }
  return safeScale
}

export default getScaleForDC
