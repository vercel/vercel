// @flow
import chalk from 'chalk';
import stamp from '../../util/output/stamp';
import wait from '../../util/output/wait';
import { Now, Output } from '../../util/types';
import { PaymentSourceNotFound } from '../../util/errors';

type PurchaseDomainPayload = {
  uid: string
};

async function purchaseDomain(output: Output, now: Now, domain: string) {
  const purchaseStamp = stamp();
  const cancelWait = wait('Purchasing');
  try {
    const { uid }: PurchaseDomainPayload = await now.fetch('/domains/buy', {
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
    } else {
      throw error;
    }
  }
}

export default purchaseDomain;
