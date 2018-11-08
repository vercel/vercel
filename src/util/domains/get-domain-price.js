// @flow
import { stringify } from 'querystring';
import { Now } from '../types';
import * as Errors from '../errors';
import getCreditCards from '../billing/get-credit-cards';
import type { DomainPrice } from '../types';
import validateCoupon from './validate-coupon';

export default async function getDomainPrice(
  now: Now,
  name: string,
  coupon?: string
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
    const payload: DomainPrice = await now.fetch(
      `/v3/domains/price?${stringify({ name })}`
    );
    const result: DomainPrice = coupon
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
