// @flow
import { Now, Output } from '../../util/types'

async function deleteDNSRecordById(output: Output, now: Now, contextName: string, domain: string, recordId: string) {
  return now.fetch(`/domains/${encodeURIComponent(domain)}/records/${recordId}`, {
    method: 'DELETE'
  })
}

export default deleteDNSRecordById
