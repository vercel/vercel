// @flow 
import { Output, Now } from '../types'

async function deleteCertById(output: Output, now: Now, id: string) {
  return now.fetch(`/v3/now/certs/${id}`, {
    method: 'DELETE',
  })
}

export default deleteCertById
