// @flow
import type { Scale, NpmDeployment, BinaryDeployment } from '../../util/types'

function getScaleForDC(dc: string, deployment: NpmDeployment | BinaryDeployment) {
  const dcAttrs = deployment.scale && deployment.scale[dc] || {}
  const safeScale: Scale = { min: dcAttrs.min, max: dcAttrs.max }
  return safeScale
}

export default getScaleForDC
