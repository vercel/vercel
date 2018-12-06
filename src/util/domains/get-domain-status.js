import qs from 'querystring';

export default async function getDomainStatus(now, domain) {
  return now.fetch(
    `/v3/domains/status?${qs.stringify({ name: domain })}`
  );
}
