import { stringify } from 'querystring';

export default async function getCouponInfo(now, coupon) {
  return now.fetch(`/v3/domains/buy?${stringify({ coupon })}`);
}
