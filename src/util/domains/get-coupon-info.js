//      
import { stringify } from 'querystring';
import { Now } from '../types';

                   
                     
                  
  

export default async function getCouponInfo(now     , coupon        ) {
  const result             = await now.fetch(
    `/v3/domains/buy?${stringify({ coupon })}`
  );
  return result;
}
