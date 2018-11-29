//      
import chalk from 'chalk';
import stamp from '../../util/output/stamp';
import wait from '../../util/output/wait';

import { PaymentSourceNotFound } from '../../util/errors';

                              
             
  

async function purchaseDomain(output        , now     , domain        ) {
  const purchaseStamp = stamp();
  const cancelWait = wait('Purchasing');
  try {
    const { uid }                        = await now.fetch('/domains/buy', {
      body: { name: domain },
      method: 'POST'
    });
    cancelWait();
    output.log(
      `Domain purchased and created ${chalk.gray(
        `(${uid})`
      )} ${purchaseStamp()}`
    );
    return { uid };
  } catch (error) {
    cancelWait();
    if (error.code === 'source_not_found') {
      return new PaymentSourceNotFound();
    } 
      throw error;
    
  }
}

export default purchaseDomain;
