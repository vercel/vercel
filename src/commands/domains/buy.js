//      
import chalk from 'chalk';
import psl from 'psl';


import * as Errors from '../../util/errors';
import cmd from '../../util/output/cmd';
import getScope from '../../util/get-scope';
import getDomainPrice from '../../util/domains/get-domain-price';
import getDomainStatus from '../../util/domains/get-domain-status';
import Now from '../../util';
import param from '../../util/output/param';
import promptBool from '../../util/input/prompt-bool';
import purchaseDomain from '../../util/domains/purchase-domain';
import stamp from '../../util/output/stamp';
                                                          
import wait from '../../util/output/wait';

export default async function buy(
  ctx            ,
  opts                   ,
  args          ,
  output        
)                  {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const { contextName } = await getScope({
    apiUrl,
    token,
    debug,
    currentTeam
  });

  // $FlowFixMe
  const now = new Now({ apiUrl, token, debug, currentTeam });
  const coupon = opts['--coupon'];
  const domainName = args[0];

  if (!domainName) {
    output.error(`Missing domain name. Run ${cmd('now domains --help')}`);
    return 1;
  }

  const { domain: rootDomain, subdomain } = psl.parse(domainName);
  if (subdomain || !rootDomain) {
    output.error(
      `Invalid domain name "${domainName}". Run ${cmd('now domains --help')}`
    );
    return 1;
  }

  const availableStamp = stamp();
  const domainPrice = await getDomainPrice(now, domainName, coupon);
  if (domainPrice instanceof Errors.InvalidCoupon) {
    output.error(`The coupon ${param(coupon)} is not valid.`);
    return 1;
  } if (domainPrice instanceof Errors.UsedCoupon) {
    output.error(`The coupon ${param(coupon)} has already been used.`);
    return 1;
  }
  if (domainPrice instanceof Errors.UnsupportedTLD) {
    output.error(`The TLD for ${param(domainName)} is not supported.`);
    return 1;
  }

  if (domainPrice instanceof Errors.MissingCreditCard) {
    output.print(
      'You have no credit cards on file. Please add one in order to claim your free domain'
    );
    output.print(`Your card will ${chalk.bold('not')} be charged`);
    return 1;
  }

  if (!(await getDomainStatus(now, domainName)).available) {
    output.error(
      `The domain ${param(domainName)} is ${chalk.underline(
        'unavailable'
      )}! ${availableStamp()}`
    );
    return 1;
  }

  const { period, price } = domainPrice;
  output.log(
    `The domain ${param(domainName)} is ${chalk.underline(
      'available'
    )} to buy under ${chalk.bold(contextName)}! ${availableStamp()}`
  );
  if (
    !await promptBool(
      `Buy now for ${chalk.bold(`$${price}`)} (${`${period}yr${period > 1
        ? 's'
        : ''}`})?`
    )
  ) {
    return 0;
  }

  const purchaseStamp = stamp();
  const stopPurchaseSpinner = wait('Purchasing');
  const buyResult = await purchaseDomain(
    output,
    now,
    domainName,
    coupon,
    price
  );
  stopPurchaseSpinner();

  if (buyResult instanceof Errors.InvalidDomain) {
    output.error(`The domain ${buyResult.meta.domain} is not valid.`);
    return 1;
  } if (buyResult instanceof Errors.DomainNotAvailable) {
    output.error(`The domain ${buyResult.meta.domain} is not available.`);
    return 1;
  } if (buyResult instanceof Errors.DomainServiceNotAvailable) {
    output.error(
      `The domain purchase service is not available. Please try again later.`
    );
    return 1;
  } if (buyResult instanceof Errors.UnexpectedDomainPurchaseError) {
    output.error(`An unexpected error happened while performing the purchase.`);
    return 1;
  } if (buyResult instanceof Errors.PremiumDomainForbidden) {
    output.error(`A coupon cannot be used to register a premium domain.`);
    return 1;
  }

  console.log(
    `${chalk.cyan('> Success!')} Domain ${param(
      domainName
    )} purchased ${purchaseStamp()}`
  );
  output.note(
    `You may now use your domain as an alias to your deployments. Run ${cmd(
      'now alias --help'
    )}`
  );
  return 0;
}
