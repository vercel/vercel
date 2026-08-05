import type Client from '../../util/client';
import output from '../../output-manager';

export async function listPaymentMethods(
  client: Client,
  asJson: boolean
): Promise<number> {
  const paymentMethods = await client.fetch<Record<string, unknown>>(
    '/v1/integrations/installations/payment-methods'
  );
  if (asJson) {
    client.stdout.write(`${JSON.stringify({ paymentMethods }, null, 2)}\n`);
  } else {
    client.stdout.write(`${JSON.stringify(paymentMethods, null, 2)}\n`);
  }
  return 0;
}

export async function setDefaultPaymentMethod(
  client: Client,
  installationId: string,
  paymentMethodId: string,
  asJson: boolean
): Promise<number> {
  const response = await client.fetch<Record<string, unknown>>(
    `/v1/integrations/installations/${encodeURIComponent(installationId)}/payment-method`,
    { method: 'POST', body: { paymentMethodId }, json: true }
  );
  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ response, installationId, paymentMethodId }, null, 2)}\n`
    );
  } else {
    output.success('Default payment method updated.');
  }
  return 0;
}
