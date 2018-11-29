//      

import { InvalidCoupon, UsedCoupon } from '../errors';
import getCouponInfo from './get-coupon-info';

export default async function validateCoupon(now     , coupon        ) {
  const couponInfo = await getCouponInfo(now, coupon);

  if (!couponInfo.isValid) {
    return new InvalidCoupon(coupon);
  }

  if (!couponInfo.canBeUsed) {
    return new UsedCoupon(coupon);
  }

  return true;
}
