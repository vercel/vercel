//      
import * as Errors from '../errors';


export default async function purchaseDomain(
  output        ,
  now     ,
  name        ,
  coupon        ,
  expectedPrice        
) {
  try {
    return await now.fetch(`/v3/domains/buy`, {
      body: JSON.stringify({ name, coupon, expectedPrice }),
      method: 'POST'
    });
  } catch (error) {
    if (error.code === 'invalid_domain') {
      return new Errors.InvalidDomain(name);
    } if (error.code === 'not_available') {
      return new Errors.DomainNotAvailable(name);
    } if (error.code === 'service_unavailabe') {
      return new Errors.DomainServiceNotAvailable();
    } if (error.code === 'unexpected_error') {
      return new Errors.UnexpectedDomainPurchaseError();
    } if (error.code === 'forbidden_premium') {
      return new Errors.PremiumDomainForbidden();
    } 
      throw error;
    
  }
}
