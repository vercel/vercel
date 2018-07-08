// @flow
import * as Errors from '../errors'
import { Now, Output } from '../types'

export default async function purchaseDomain(output: Output, now: Now, name: string, coupon: string, expectedPrice: number) {
  try {
    return await now.fetch(`/v3/domains/buy`, {
      body: JSON.stringify({ name, coupon, expectedPrice }),
      method: 'POST'
    })
  } catch (error) {
    if (error.code === 'invalid_domain') {
      return new Errors.InvalidDomain(name)
    } else if (error.code === 'not_available') {
      return new Errors.DomainNotAvailable(name)
    } else if (error.code === 'service_unavailabe') {
      return new Errors.DomainServiceNotAvailable()
    } else if (error.code === 'unexpected_error') {
      return new Errors.UnexpectedDomainPurchaseError()
    } else if (error.code === 'forbidden_premium') {
      return new Errors.PremiumDomainForbidden()
    } else {
      throw error
    }
  }
}
