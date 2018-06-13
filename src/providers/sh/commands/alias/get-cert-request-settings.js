// @flow
import type { HTTPChallengeInfo } from '../../util/types'

export default function getCertRequestSettings(
  alias: string,
  domain: string,
  subdomain: string,
  httpChallengeInfo?: HTTPChallengeInfo,
) {
  const hasSubdomain = Boolean(subdomain);
  const isDeeplyNested = hasSubdomain && subdomain.indexOf('.') !== -1;
  if (httpChallengeInfo) {
    if (hasSubdomain) {
      if (httpChallengeInfo.canSolveForRootDomain && !isDeeplyNested) {
        return { cns: [domain, `*.${domain}`], preferDNS: false }
      } else {
        return { cns: [alias], preferDNS: true }
      }
    } else {
      if (httpChallengeInfo.canSolveForRootDomain) {
        return { cns: [domain, `*.${domain}`], preferDNS: false }
      } else if (httpChallengeInfo.canSolveForSubdomain) {
        return { cns: [alias], preferDNS: false }
      } else {
        return { cns: [alias], preferDNS: true }
      }
    }
  } else if (isDeeplyNested) {
    return { cns: [alias], preferDNS: false }
  } else {
    return { cns: [domain, `*.${domain}`], preferDNS: false }
  }
}
