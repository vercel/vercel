//

async function deleteDNSRecordById(output, now, contextName, domain, recordId) {
  return now.fetch(
    `/v3/domains/${encodeURIComponent(domain)}/records/${recordId}`,
    {
      method: 'DELETE'
    }
  );
}

export default deleteDNSRecordById;
