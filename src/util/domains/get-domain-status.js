import qs from 'querystring';

async function getDomainStatus(
  now     ,
  domain
)                        {
  return now.fetch(
    `/v3/domains/status?${qs.stringify({ name: domain })}`
  );
}

export default getDomainStatus;
