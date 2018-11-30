//      


async function removeDomainByName(output        , now     , domain        ) {
  return now.fetch(`/v3/domains/${domain}`, { method: 'DELETE' });
}

export default removeDomainByName;
