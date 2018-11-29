//      
import { stringify } from 'querystring';

import * as Errors from '../errors';
import getCreditCards from '../billing/get-credit-cards';
                                            
import validateCoupon from './validate-coupon';

export default async function getDomainPrice(
  now     ,
  name        ,
  coupon         
) {
  if (coupon) {
    const [validateResult, creditCards] = await Promise.all([
      validateCoupon(now, coupon),
      getCreditCards(now)
    ]);

    if (
      validateResult instanceof Errors.InvalidCoupon ||
      validateResult instanceof Errors.UsedCoupon
    ) {
      return validateResult;
    }

    if (creditCards.length === 0) {
      return new Errors.MissingCreditCard();
    }
  }

  try {
    const payload              = await now.fetch(
      `/v3/domains/price?${stringify({ name })}`
    );
    const result              = coupon
      ? { price: 0, period: payload.price }
      : payload;
    return result;
  } catch (error) {
    if (error.code === 'unsupported_tld') {
      return new Errors.UnsupportedTLD(name);
    }
    throw error;
  }
}
