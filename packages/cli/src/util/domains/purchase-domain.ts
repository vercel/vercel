import * as ERRORS from '../errors-ts';
import type Client from '../client';
import { getOrderOutcome, pollForOrder } from './get-order';
import getScope from '../get-scope';
import type { ContactInformation } from './collect-contact-information';

type OrderResponse = {
  orderId: string;
};

/**
 * Buys a domain. Throws only when nothing was charged (a failure before the
 * order is sent, or an unmapped 4xx); a possible charge comes back as
 * `DomainChargeOutcomeUnknown`.
 */
export default async function purchaseDomain(
  client: Client,
  name: string,
  expectedPrice: number,
  years: number,
  autoRenew: boolean = true,
  contactInformation: ContactInformation
) {
  const { team } = await getScope(client);
  const teamParam = team ? `?teamId=${team.slug}` : '';

  let orderId: string;
  try {
    ({ orderId } = await client.fetch<OrderResponse>(
      `/v1/registrar/domains/${name}/buy${teamParam}`,
      {
        body: {
          expectedPrice,
          autoRenew,
          years,
          contactInformation,
        },
        method: 'POST',
        // The registrar takes no idempotency key, so a retry after a lost
        // response could charge twice, and a 429 would only wait out a retry
        // that never comes.
        retry: { retries: 0 },
        bailOn429: true,
      }
    ));
  } catch (err: unknown) {
    if (ERRORS.isAPIError(err) && err.status < 500) {
      if (err.code === 'invalid_domain') {
        return new ERRORS.InvalidDomain(name);
      }
      if (err.code === 'domain_not_available') {
        return new ERRORS.DomainNotAvailable(name);
      }
      if (err.code === 'tld_not_supported') {
        return new ERRORS.UnsupportedTLD(name);
      }
      if (err.code === 'additional_contact_info_required') {
        return new ERRORS.TLDNotSupportedViaCLI(name);
      }
      if (err.code === 'expected_price_mismatch') {
        return new ERRORS.DomainPriceChanged(name);
      }
      throw err;
    }
    return new ERRORS.DomainChargeOutcomeUnknown(name, 'buy');
  }

  let order;
  try {
    order = await pollForOrder(client, orderId);
  } catch {
    order = null;
  }
  if (order === null) {
    return new ERRORS.DomainChargeOutcomeUnknown(name, 'buy');
  }

  switch (getOrderOutcome(order, name)) {
    case 'completed':
      return { orderId };
    case 'payment_failed':
      return new ERRORS.DomainPaymentError();
    case 'refund_failed':
      return new ERRORS.DomainPurchaseRefundFailed(name);
    case 'refunded':
      return new ERRORS.DomainPurchaseRefunded(name);
    case 'failed':
      return new ERRORS.UnexpectedDomainPurchaseError(name);
    case 'unknown':
      return new ERRORS.DomainChargeOutcomeUnknown(name, 'buy');
  }
}
