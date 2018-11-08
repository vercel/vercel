// @flow
import { Now, Output } from '../../util/types';

async function deleteDNSRecordById(
  output: Output,
  now: Now,
  contextName: string,
  domain: string,
  recordId: string
) {
  return now.fetch(
    `/v3/domains/${encodeURIComponent(domain)}/records/${recordId}`,
    {
      method: 'DELETE'
    }
  );
}

export default deleteDNSRecordById;
