// @flow
import type { HTTPChallengeInfo } from '../../util/types'

export default function getCertRequestSettings(
  alias: string,
  domain: string,
  subdomain: string,
  httpChallengeInfo?: HTTPChallengeInfo,
) {
  if (httpChallengeInfo) {
    if (subdomain === null) {
      if (httpChallengeInfo.canSolveForRootDomain) {
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
  } else {
    return { cns: [domain, `*.${domain}`], preferDNS: false }
  }
}
