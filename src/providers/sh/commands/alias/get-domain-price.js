// @flow
import qs from 'querystring'
import { Now } from '../../util/types'

type DomainPrice = {
  period: boolean,
  price: number,
}

async function getDomainPrice(now: Now, domain: string): Promise<DomainPrice> {
  return now.fetch(`/domains/price?${qs.stringify({ name: domain })}`)
}

export default getDomainPrice
