// @flow
import wait from '../../../../util/output/wait'

import { Now } from './types'
import { DomainNameserversNotFound } from './errors'

type NameserversResponse = {
  nameservers: string[]
}

async function getDomainNameservers(now: Now, domain: string) {
  const cancelFetchingMessage = wait(`Fetching DNS nameservers for ${domain}`)
  try {
    let { nameservers }: NameserversResponse = await now.fetch(`/whois-ns?domain=${encodeURIComponent(domain)}`)
    cancelFetchingMessage()
    return nameservers.filter(ns => {
      // Temporary hack since sometimes we get a response that looks like: ['ns', 'ns', '', '']
      // so we have to filter the empty ones
      return ns.length > 0
    })
  } catch (error) {
    cancelFetchingMessage()
    if (error.status === 404) {
      return new DomainNameserversNotFound(domain)
    } else {
      throw error
    }
  }
}

export default getDomainNameservers
