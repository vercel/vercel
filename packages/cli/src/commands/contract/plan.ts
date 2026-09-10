import type Client from '../../util/client';
import output from '../../output-manager';

export async function previewPlan(
  client: Client,
  asJson: boolean
): Promise<number> {
  const plan = await client.fetch<Record<string, unknown>>('/plan');
  if (asJson) {
    client.stdout.write(`${JSON.stringify({ plan }, null, 2)}\n`);
  } else {
    client.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  }
  return 0;
}

export async function changePlan(
  client: Client,
  toPlan: string,
  asJson: boolean
): Promise<number> {
  const response = await client.fetch<Record<string, unknown>>(
    '/v1/plan/change',
    {
      method: 'PUT',
      body: { plan: toPlan },
      json: true,
    }
  );
  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ response, plan: toPlan }, null, 2)}\n`
    );
  } else {
    output.success(`Plan change requested: ${toPlan}`);
  }
  return 0;
}
