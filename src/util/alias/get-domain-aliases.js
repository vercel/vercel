//

import getAliases from './get-aliases';

async function getDomainAliases(output        , now     , domain        ) {
  const aliases = await getAliases(now);
  return aliases.filter((alias) => alias.alias.endsWith(domain));
}

export default getDomainAliases;
