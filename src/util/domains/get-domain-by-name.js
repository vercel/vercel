//
import chalk from 'chalk';

import wait from '../output/wait';
import toHost from '../to-host';

async function getDomainByName(
  output        ,
  now     ,
  contextName        ,
  domainName
) {
  const cancelWait = wait(`Fetching domain under ${chalk.bold(contextName)}`);
  const domain = await now.fetch(`/v3/domains/${toHost(domainName)}`);
  cancelWait();

  return domain;
}

export default getDomainByName;
