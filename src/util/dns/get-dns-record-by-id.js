//      
import getDNSRecords from './get-dns-records';

                                          

async function getDNSRecordById(
  output        ,
  now     ,
  contextName        ,
  id        
)                                                            {
  const recordsByDomains = await getDNSRecords(output, now, contextName);
  return recordsByDomains.reduce((result, { domainName, records }) => {
    if (result) {
      return result;
    }
    const record = records.find(record => record.id === id);
    return record ? { domainName, record } : null;
  }, null);
}

export default getDNSRecordById;
