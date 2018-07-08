// @flow
import { stringify } from 'querystring'
import { Now } from '../types'

type CouponInfo = {
  canBeUsed: boolean,
  isValid: boolean
}

export default async function getCouponInfo(now: Now, coupon: string) {
  const result: CouponInfo = await now.fetch(`/v3/domains/buy?${stringify({ coupon })}`)
  return result
}
