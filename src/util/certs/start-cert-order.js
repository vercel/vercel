//      
import chalk from 'chalk';

import wait from '../output/wait';
                                                 

export default async function startCertOrder(
  now     ,
  cns          ,
  contextName        
) {
  const cancelWait = wait(
    `Starting certificate issuance for ${chalk.bold(
      cns.join(', ')
    )} under ${chalk.bold(contextName)}`
  );
  try {
    const order                   = await now.fetch('/v3/now/certs', {
      method: 'PATCH',
      body: {
        op: 'startOrder',
        domains: cns
      }
    });
    cancelWait();
    return order;
  } catch (error) {
    cancelWait();
    throw error;
  }
}
