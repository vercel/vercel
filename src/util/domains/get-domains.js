//      
import chalk from 'chalk';

                                       
import wait from '../output/wait';

async function getDomains(output        , now     , contextName        ) {
  const cancelWait = wait(`Fetching domains under ${chalk.bold(contextName)}`);
  const payload = await now.fetch('/v3/domains');
  const domains           = payload.domains.sort(
    (a, b) => new Date(b.created) - new Date(a.created)
  );
  cancelWait();
  return domains;
}

export default getDomains;
